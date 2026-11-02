"""Train a streaming GRU on full official EdNet KT1, when provided.

No raw student records or model weights are committed to the public site.
An incomplete archive fails closed unless --fixture-test is explicitly set.
Full benchmark: >= 700k KT1 student files, ~1.2GB ZIP and official questions.csv.
Usage: python scripts/train_ednet_full_streaming.py --kt1 path/EdNet-KT1.zip --questions path/questions.csv
Dependencies: torch; standard library. Outputs to ignored out/real_learning/.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import random
import re
import zipfile
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, IterableDataset
from torch.nn.utils.rnn import pad_sequence

PATTERN = re.compile(r"(?:^|/)u[0-9]+\.csv$", re.I)
MIN_FULL_FILES = 700000
MIN_FULL_BYTES = 900000000


def load_keys(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as f:
        rd = csv.DictReader(f)
        if not {"question_id", "correct_answer"}.issubset(rd.fieldnames or []):
            raise ValueError("Official EdNet questions.csv answer key is required")
        answers = {r["question_id"]: r["correct_answer"].lower()
                   for r in rd if r.get("correct_answer", "").lower() in "abcd"
                   and len(r.get("correct_answer", "")) == 1}
    if not answers:
        raise ValueError("No valid EdNet question answers")
    vocabulary = {q: i for i, q in enumerate(sorted(answers), 1)}
    return answers, vocabulary


def inspect_archive(path, fixture_test=False):
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError("Full EdNet KT1 ZIP not found: " + str(path))
    with zipfile.ZipFile(path) as z:
        members = [f.filename for f in z.infolist() if PATTERN.search(f.filename)]
    if not fixture_test and (path.stat().st_size < MIN_FULL_BYTES or len(members) < MIN_FULL_FILES):
        raise ValueError("This is not the complete official KT1 archive; full training aborted")
    if not members:
        raise ValueError("No KT1 student files were found")
    return members


def role(member, holdout_fraction=0.2):
    digest = hashlib.sha256(("whatnext:ednet:split:v1|" + member).encode()).digest()
    return "test" if int.from_bytes(digest[:8], "big") / (1 << 64) < holdout_fraction else "train"


def parse_history(z, filename, answers, vocab):
    events = []
    with z.open(filename) as source, io.TextIOWrapper(source, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not {"timestamp", "question_id", "user_answer", "elapsed_time"}.issubset(reader.fieldnames or []):
            raise ValueError("Unexpected official KT1 schema in " + filename)
        for r in reader:
            q = r.get("question_id", "")
            observed = r.get("user_answer", "").lower()
            if q not in answers or observed not in ("a", "b", "c", "d"):
                continue
            try:
                timestamp = int(r["timestamp"])
            except (ValueError, TypeError):
                continue
            events.append((timestamp, vocab[q], int(observed == answers[q])))
    events.sort(key=lambda x: x[0])
    return events


class StreamingHistories(IterableDataset):
    def __init__(self, path, members, answers, vocab, split, steps, seed):
        self.path, self.members, self.answers, self.vocab = path, members, answers, vocab
        self.split, self.steps, self.seed = split, steps, seed

    def __iter__(self):
        names = [n for n in self.members if role(n) == self.split]
        if self.split == "train":
            random.Random(self.seed).shuffle(names)
        with zipfile.ZipFile(self.path) as z:
            for name in names:
                events = parse_history(z, name, self.answers, self.vocab)
                for offset in range(0, len(events) - 1, self.steps):
                    chunk = events[offset:offset + self.steps + 1]
                    if len(chunk) < 2:
                        continue
                    source = torch.tensor([2 * x[1] + x[2] for x in chunk[:-1]])
                    query = torch.tensor([x[1] for x in chunk[1:]])
                    labels = torch.tensor([float(x[2]) for x in chunk[1:]])
                    yield (source, query, labels)


def batch(items):
    source, query, labels = zip(*items)
    length = torch.tensor([len(x) for x in source])
    mask = torch.arange(max(length))[None, :] < length[:, None]
    return pad_sequence(source, batch_first=True), pad_sequence(query, batch_first=True), pad_sequence(labels, batch_first=True), mask


class GRU(nn.Module):
    def __init__(self, count):
        super().__init__()
        self.lookup = nn.Embedding(2 * count, 32)
        self.gru = nn.GRU(32, 48, batch_first=True)
        self.query = nn.Embedding(count, 48)
        self.bias = nn.Embedding(count, 1)

    def forward(self, source, query):
        states, _ = self.gru(self.lookup(source))
        return (states * self.query(query)).sum(-1) / math.sqrt(48) + self.bias(query).squeeze(-1)


def run(args):
    torch.manual_seed(args.seed)
    answers, vocab = load_keys(args.questions)
    members = inspect_archive(args.kt1, fixture_test=args.fixture_test)
    if not args.fixture_test and len(answers) < 10000:
        raise ValueError("Full EdNet metadata must provide at least 10,000 valid questions")
    train_members = sum(role(n) == "train" for n in members)
    test_members = len(members) - train_members
    if not train_members or not test_members:
        raise ValueError("Source has no train/holdout learner split")
    model = GRU(len(vocab) + 1)
    device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
    model.to(device)
    optim = torch.optim.AdamW(model.parameters(), lr=0.001)
    for epoch in range(args.epochs):
        ds = StreamingHistories(args.kt1, members, answers, vocab, "train", args.steps, args.seed + epoch)
        loader = DataLoader(ds, batch_size=args.batch_size, num_workers=0, collate_fn=batch)
        model.train()
        count, total_loss, batches = 0, 0.0, 0
        for source, query, target, mask in loader:
            source, query, target, mask = [x.to(device) for x in (source, query, target, mask)]
            optim.zero_grad()
            logits = model(source, query)
            loss = nn.functional.binary_cross_entropy_with_logits(logits[mask], target[mask])
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optim.step()
            total_loss += loss.item()
            batches += 1
            count += int(mask.sum())
        if not batches:
            raise ValueError("No valid EdNet training interactions")
        print(f"epoch={epoch + 1} train_next_responses={count} mean_batch_loss={total_loss / batches:.5f}", flush=True)
    model.eval()
    total = positive = correct = 0
    brier_total = logloss_total = 0.0
    loader = DataLoader(StreamingHistories(args.kt1, members, answers, vocab, "test", args.steps, args.seed),
                        batch_size=args.batch_size, num_workers=0, collate_fn=batch)
    with torch.no_grad():
        for source, query, target, mask in loader:
            source, query, target, mask = [x.to(device) for x in (source, query, target, mask)]
            logits = model(source, query)[mask]
            y = target[mask]
            p = torch.sigmoid(logits)
            count = int(y.numel())
            total += count
            positive += float(y.sum())
            correct += int(((p >= .5) == (y > .5)).sum())
            brier_total += float(((p-y)**2).sum())
            logloss_total += float(nn.functional.binary_cross_entropy_with_logits(logits, y, reduction="sum"))
    if not total:
        raise ValueError("No observed heldout next-responses")
    rate = positive / total
    metrics = {
        "source": "Official Riiid EdNet KT1", "actual_full_archive": not args.fixture_test,
        "eligible_student_files": len(members), "train_student_files": train_members,
        "holdout_student_files": test_members, "holdout_next_responses": total,
        "epochs": args.epochs, "split": "student-file-disjoint deterministic sha256 80/20",
        "accuracy": correct / total, "majority_class_baseline": max(rate, 1-rate),
        "accuracy_lift": correct / total - max(rate, 1-rate),
        "brier_score": brier_total / total, "log_loss": logloss_total / total,
        "english_domain_only": True, "technical_lesson_recommendations_validated": False
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "ednet_full_metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    torch.save(model.state_dict(), args.output / "ednet_gru.pt")
    return metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kt1", type=Path, required=True)
    parser.add_argument("--questions", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("out/real_learning/ednet_full"))
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--steps", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--cpu", action="store_true")
    parser.add_argument("--fixture-test", action="store_true", help="Explicit tiny fixture verification; never full training")
    args = parser.parse_args()
    if min(args.epochs, args.steps, args.batch_size) < 1:
        parser.error("epochs, steps, and batch-size must be positive")
    print(json.dumps(run(args), indent=2))


if __name__ == "__main__":
    main()
