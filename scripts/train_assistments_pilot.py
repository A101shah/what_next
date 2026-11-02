"""Reproduce the WhatNext experimental ASSISTments GRU pilot on published data.

Source: https://github.com/ranydb/EAKT/blob/master/csv/assist2009_updated/assist2009_updated_test.csv
This preprocessed file contains 3-line student-like traces (length, skill IDs,
binary outcomes) WITHOUT original learner identifiers. Holdout is therefore
TRACE-disjoint, not verifiably original-person-disjoint.

Download source CSV yourself; keep it under ignored out/ (not in public GitHub).
python scripts/train_assistments_pilot.py --input out/assist2009_updated_test.csv
Dependency: pip install torch

This research only predicts next mathematics skill correctness. It is NOT an
AI/ML/career skill navigator and MUST NOT replace the rule-based app model.
"""
import argparse,csv,json,math,random
from pathlib import Path
from collections import Counter
import torch
from torch import nn
from torch.utils.data import DataLoader
from torch.nn.utils.rnn import pad_sequence

SEED=20261102
SOURCE_URL="https://github.com/ranydb/EAKT/blob/master/csv/assist2009_updated/assist2009_updated_test.csv"
SOURCE_BLOB="6ee1262b3442062c806758d718f64b877f809faf"

def load_sequences(path):
    lines=path.read_text(encoding="utf-8").strip().splitlines()
    if len(lines)%3: raise ValueError("Expected 3 lines per processed source history")
    users=[]
    for i in range(0,len(lines),3):
        try:
            n=int(lines[i])
            skills=[int(x) for x in lines[i+1].split(",")]
            labels=[int(x) for x in lines[i+2].split(",")]
        except ValueError:continue
        if n<20 or len(skills)!=n or len(labels)!=n:continue
        if not all(1<=q<=110 for q in skills) or not all(y in (0,1) for y in labels):continue
        users.append(list(zip(skills,labels)))
    if len(users)<52:raise ValueError("The selected source lacks 52 eligible sequence histories")
    # Exact deterministic Fisher-Yates randomization used in the verified pilot.
    state=SEED
    for i in range(len(users)-1,0,-1):
        state=(state*1664525+1013904223)&0xffffffff
        j=(state*(i+1))//(1<<32)
        users[i],users[j]=users[j],users[i]
    selected=[u[:65] for u in users[:52]]
    if sum(map(len,selected))!=2624 or sum(y for u in selected for q,y in u)!=1633:
        raise ValueError("Pilot sequence content does not match independently validated source")
    return selected

def batch(items):
    x,q,y=zip(*items)
    lengths=torch.tensor([len(t) for t in x])
    mask=torch.arange(max(lengths))[None,:]<lengths[:,None]
    return (pad_sequence(x,batch_first=True),pad_sequence(q,batch_first=True),
            pad_sequence(y,batch_first=True),mask)

class PilotGRU(nn.Module):
    def __init__(self,size):
        super().__init__()
        self.embedding=nn.Embedding(2*size,24)
        self.gru=nn.GRU(24,32,batch_first=True)
        self.query=nn.Embedding(size,32)
        self.bias=nn.Embedding(size,1)
    def forward(self,x,q):
        h,_=self.gru(self.embedding(x))
        return (h*self.query(q)).sum(-1)/math.sqrt(32)+self.bias(q).squeeze(-1)

def run(source):
    torch.manual_seed(SEED)
    torch.set_num_threads(2)
    histories=load_sequences(source)
    order=list(range(len(histories)))
    random.Random(SEED).shuffle(order)
    cutoff=int(.8*len(order))
    training=[histories[j] for j in order[:cutoff]]
    testing=[histories[j] for j in order[cutoff:]]
    vocab={q:i for i,q in enumerate(sorted({q for h in training for q,y in h}),start=1)}
    def sequences(data):
        return [(torch.tensor([2*vocab.get(q,0)+y for q,y in h[:-1]]),
                 torch.tensor([vocab.get(q,0) for q,y in h[1:]]),
                 torch.tensor([float(y) for q,y in h[1:]])) for h in data]
    train_loader=DataLoader(sequences(training),batch_size=12,shuffle=True,collate_fn=batch)
    test_loader=DataLoader(sequences(testing),batch_size=12,shuffle=False,collate_fn=batch)
    model=PilotGRU(len(vocab)+1)
    optim=torch.optim.AdamW(model.parameters(),lr=.003)
    for epoch in range(8):
        model.train()
        losses=[]
        for x,q,y,m in train_loader:
            optim.zero_grad()
            logits=model(x,q)
            loss=nn.functional.binary_cross_entropy_with_logits(logits[m],y[m])
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(),1.)
            optim.step()
            losses.append(loss.item())
        print(f"epoch {epoch+1}: train_cross_entropy={sum(losses)/len(losses):.6f}")
    model.eval()
    actual=[];probability=[]
    with torch.no_grad():
        for x,q,y,m in test_loader:
            probability.extend(torch.sigmoid(model(x,q))[m].tolist())
            actual.extend(y[m].tolist())
    n=len(actual)
    positive=sum(actual)/n
    acc=sum((p>=.5)==bool(y) for p,y in zip(probability,actual))/n
    baseline=max(positive,1-positive)
    log_loss=sum(-y*math.log(max(1e-8,p))-(1-y)*math.log(max(1e-8,1-p))
                 for p,y in zip(probability,actual))/n
    brier=sum((p-y)**2 for p,y in zip(probability,actual))/n
    return {"source":SOURCE_URL,"source_blob_sha":SOURCE_BLOB,
            "data_type":"preprocessed ASSISTments2009 mathematics response sequences",
            "holdout_unit":"sequence_histories_not_verified_unique_original_people",
            "learners_total":len(histories),"interactions_total":sum(map(len,histories)),
            "learners_train":len(training),"learners_holdout":len(testing),
            "holdout_next_response_events":n,"holdout_positive_rate":round(positive,6),
            "gru_accuracy":round(acc,6),"majority_class_accuracy_baseline":round(baseline,6),
            "accuracy_lift_vs_baseline":round(acc-baseline,6),
            "holdout_log_loss":round(log_loss,6),"holdout_brier_score":round(brier,6),
            "epochs":8,"seed":SEED,"model":"PyTorch GRU(24-dimensional embedding,32 hidden)",
            "trained_for_production":False,"supports_technical_next_lesson_accuracy":False,
            "purpose":"small research-only pilot; full EdNet remains untrained"}

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input",type=Path,required=True)
    p.add_argument("--out",type=Path,default=Path("out/real_learning/assist2009_gru_pilot_metrics.json"))
    args=p.parse_args()
    output=run(args.input)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(output,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(output,indent=2))
