"""Train a real Deep Knowledge Tracing GRU on verified EdNet/ASSISTments logs.

This does NOT train the WhatNext recommendation engine: English/math question
correctness cannot label Python or machine-learning proficiency.

pip install torch
python scripts/train_knowledge_tracing.py --input out/real_learning/ednet_interactions.csv
Artifacts/metrics stay under ignored out/ (not publicly committed).
"""
import argparse,csv,json,math,random
from pathlib import Path
from collections import defaultdict
import torch
from torch import nn
from torch.utils.data import DataLoader
from torch.nn.utils.rnn import pad_sequence

def read_histories(path):
    groups=defaultdict(list)
    domains=set()
    with Path(path).open(newline="",encoding="utf-8-sig") as f:
        rd=csv.DictReader(f)
        required={"student_id","timestamp_or_order","question_id","is_correct","domain"}
        if not required.issubset(rd.fieldnames or []):raise ValueError("Unrecognized learning-interactions CSV")
        for r in rd:
            if r["is_correct"] not in ("0","1") or not r["student_id"] or not r["question_id"]:continue
            domains.add(r["domain"])
            try:order=int(r["timestamp_or_order"])
            except (TypeError,ValueError):continue
            groups[r["student_id"]].append((order,r["question_id"],int(r["is_correct"])))
    if len(domains)!=1:raise ValueError("Do not train a single subject model on mixed learning domains")
    histories=[]
    for student,events in groups.items():
        events.sort(key=lambda x:x[0])
        if len(events)>=2:histories.append((student,events))
    return histories, next(iter(domains)) if domains else "unknown"

def encode(histories,vocab,max_steps):
    encoded=[]
    for student,events in histories:
        # Consecutive chronological blocks. No next-answer target is in the input.
        for offset in range(0,len(events)-1,max_steps):
            window=events[offset:offset+max_steps+1]
            if len(window)<2:continue
            input_items=[2*vocab.get(q,0)+correct for _,q,correct in window[:-1]]
            target_items=[vocab.get(q,0) for _,q,_ in window[1:]]
            labels=[float(correct) for _,_,correct in window[1:]]
            encoded.append((torch.tensor(input_items),torch.tensor(target_items),
                            torch.tensor(labels,dtype=torch.float32)))
    return encoded

def pad_batch(batch):
    source,query,labels=zip(*batch)
    lengths=torch.tensor([len(x) for x in source])
    return (pad_sequence(source,batch_first=True),
            pad_sequence(query,batch_first=True),
            pad_sequence(labels,batch_first=True),
            torch.arange(max(lengths)).unsqueeze(0)<lengths.unsqueeze(1))

class DKT(nn.Module):
    def __init__(self,vocab_size,embedding=48,hidden=64):
        super().__init__()
        self.interaction=nn.Embedding(vocab_size*2,embedding)
        self.gru=nn.GRU(embedding,hidden,batch_first=True)
        self.question=nn.Embedding(vocab_size,hidden)
        self.bias=nn.Embedding(vocab_size,1)
        self.hidden=hidden
    def forward(self,source,query):
        history,_=self.gru(self.interaction(source))
        return (history*self.question(query)).sum(-1)/math.sqrt(self.hidden)+self.bias(query).squeeze(-1)

def evaluation(model,loader,device):
    model.eval()
    losses=[];predictions=[];outcomes=[]
    with torch.no_grad():
        for source,query,y,mask in loader:
            logits=model(source.to(device),query.to(device))[mask.to(device)]
            targets=y.to(device)[mask.to(device)]
            losses.extend(nn.functional.binary_cross_entropy_with_logits(
                logits,targets,reduction="none").cpu().tolist())
            predictions.extend(torch.sigmoid(logits).cpu().tolist())
            outcomes.extend(targets.cpu().tolist())
    if not predictions:raise ValueError("No eligible evaluation interactions")
    accuracy=sum((p>=.5)==bool(y) for p,y in zip(predictions,outcomes))/len(predictions)
    brier=sum((p-y)**2 for p,y in zip(predictions,outcomes))/len(predictions)
    return {"next_response_accuracy":round(accuracy,4),"log_loss":round(sum(losses)/len(losses),4),
            "brier_score":round(brier,4),"evaluated_next_responses":len(predictions),
            "positive_rate":round(sum(outcomes)/len(outcomes),4)}

def train(args):
    torch.manual_seed(args.seed);random.seed(args.seed)
    histories,domain=read_histories(args.input)
    observations=sum(len(events) for _,events in histories)
    if len(histories)<args.min_students or observations<args.min_interactions:
        raise ValueError(f"Insufficient independent real data: {len(histories)} learners, "
                         f"{observations} rows (require >= {args.min_students} learners and "
                         f">= {args.min_interactions} interactions). The 100-row pilot is NOT suitable.")
    rng=random.Random(args.seed);rng.shuffle(histories)
    split=min(len(histories)-1,max(1,int(.8*len(histories))))
    training,heldout=histories[:split],histories[split:]
    vocab={q:i for i,q in enumerate(sorted({q for _,events in training for _,q,_ in events}),start=1)}
    train_data=encode(training,vocab,args.max_steps)
    test_data=encode(heldout,vocab,args.max_steps)
    if not train_data or not test_data:raise ValueError("Not enough consecutive attempts")
    train_loader=DataLoader(train_data,batch_size=args.batch_size,shuffle=True,collate_fn=pad_batch)
    eval_loader=DataLoader(test_data,batch_size=args.batch_size,shuffle=False,collate_fn=pad_batch)
    device=torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
    model=DKT(len(vocab)+1).to(device)
    optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr)
    for epoch in range(args.epochs):
        model.train();losses=[]
        for source,query,y,mask in train_loader:
            optimizer.zero_grad()
            logits=model(source.to(device),query.to(device))
            loss=nn.functional.binary_cross_entropy_with_logits(
                logits[mask.to(device)],y.to(device)[mask.to(device)])
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(),1.)
            optimizer.step()
            losses.append(loss.item())
        print(f"epoch {epoch+1}/{args.epochs} training_loss={sum(losses)/len(losses):.4f}")
    metrics=evaluation(model,eval_loader,device)
    metrics.update({"dataset_domain":domain,"training_learners":len(training),
                    "heldout_learners":len(heldout),"train_interactions":sum(len(e) for _,e in training),
                    "heldout_interactions":sum(len(e) for _,e in heldout),
                    "model":"GRU Deep Knowledge Tracing; previous response and next question ID",
                    "data_split":"disjoint students, 80/20 seeded; chronological per student",
                    "not_recommendation_accuracy":True,
                    "not_career_skill_mastery":True,
                    "source_input":str(args.input),
                    "seed":args.seed})
    args.out.mkdir(parents=True,exist_ok=True)
    torch.save(model.state_dict(),args.out/"dkt_weights.pt")
    (args.out/"question_vocab.json").write_text(json.dumps(vocab),encoding="utf-8")
    (args.out/"dkt_metrics.json").write_text(json.dumps(metrics,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(metrics,indent=2))
    return metrics

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input",type=Path,required=True)
    p.add_argument("--out",type=Path,default=Path("out/real_learning/dkt_model"))
    p.add_argument("--epochs",type=int,default=3)
    p.add_argument("--batch-size",type=int,default=32)
    p.add_argument("--max-steps",type=int,default=80)
    p.add_argument("--min-students",type=int,default=30)
    p.add_argument("--min-interactions",type=int,default=1000)
    p.add_argument("--seed",type=int,default=42)
    p.add_argument("--lr",type=float,default=.001)
    p.add_argument("--cpu",action="store_true")
    args=p.parse_args()
    if min(args.epochs,args.batch_size,args.max_steps,args.min_students,args.min_interactions)<=0:
        p.error("Training and minimum-data arguments must be positive")
    train(args)
if __name__=="__main__":main()
