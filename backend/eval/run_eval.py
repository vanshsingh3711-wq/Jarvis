import sys
import os
# Add parent directory to path to import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.retrieval import hybrid_search

# Mock Gold Dataset (Query -> List of Expected Document IDs)
EVAL_DATASET = [
    {
        "query": "How do you handle Hinglish?",
        "expected_doc_ids": ["doc_2"]
    },
    {
        "query": "What is the hybrid retrieval strategy?",
        "expected_doc_ids": ["doc_1"]
    },
    {
        "query": "Tell me about latency and metrics like P50.",
        "expected_doc_ids": ["doc_4"]
    }
]

def calculate_recall_at_k(retrieved_ids, expected_ids, k=3):
    retrieved_k = retrieved_ids[:k]
    hits = sum(1 for expected_id in expected_ids if expected_id in retrieved_k)
    return hits / len(expected_ids) if expected_ids else 0

def calculate_mrr(retrieved_ids, expected_ids):
    for i, doc_id in enumerate(retrieved_ids):
        if doc_id in expected_ids:
            return 1.0 / (i + 1)
    return 0.0

def run_evaluation():
    print("Running Evaluation on Gold Dataset...\n")
    
    total_recall_at_1 = 0
    total_recall_at_3 = 0
    total_mrr = 0
    
    for item in EVAL_DATASET:
        query = item["query"]
        expected_ids = item["expected_doc_ids"]
        
        # Run retrieval (top 3)
        results = hybrid_search(query, top_k=3)
        retrieved_ids = [doc.get("metadata", {}).get("doc_id") for doc in results]
        
        recall_1 = calculate_recall_at_k(retrieved_ids, expected_ids, k=1)
        recall_3 = calculate_recall_at_k(retrieved_ids, expected_ids, k=3)
        mrr = calculate_mrr(retrieved_ids, expected_ids)
        
        total_recall_at_1 += recall_1
        total_recall_at_3 += recall_3
        total_mrr += mrr
        
        print(f"Query: '{query}'")
        print(f"Expected: {expected_ids} | Retrieved: {retrieved_ids}")
        print(f"Recall@1: {recall_1:.2f} | Recall@3: {recall_3:.2f} | MRR: {mrr:.2f}\n")
        
    n = len(EVAL_DATASET)
    print("=== Final Metrics ===")
    print(f"Average Recall@1: {total_recall_at_1 / n:.2f}")
    print(f"Average Recall@3: {total_recall_at_3 / n:.2f}")
    print(f"Average MRR:      {total_mrr / n:.2f}")

if __name__ == "__main__":
    run_evaluation()
