import os
import json
from typing import List, Dict, Any
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from rank_bm25 import BM25Okapi

CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_db")
BM25_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "bm25_corpus.json")

class RetrievalService:
    def __init__(self):
        self.embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        self.vectorstore = None
        self.bm25 = None
        self.bm25_corpus = []
        
        self.load_indexes()

    def load_indexes(self):
        if os.path.exists(CHROMA_PERSIST_DIR):
            self.vectorstore = Chroma(
                persist_directory=CHROMA_PERSIST_DIR,
                embedding_function=self.embeddings
            )
        
        if os.path.exists(BM25_CACHE_PATH):
            with open(BM25_CACHE_PATH, "r") as f:
                self.bm25_corpus = json.load(f)
                tokenized_corpus = [doc["content"].split(" ") for doc in self.bm25_corpus]
                self.bm25 = BM25Okapi(tokenized_corpus)

    def hybrid_search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        # If indexes aren't built yet, return empty
        if not self.vectorstore or not self.bm25:
            print("Warning: Indexes not found. Please run ingest_msmarco.py first.")
            return []

        # 1. Dense Retrieval (Chroma)
        dense_results = self.vectorstore.similarity_search_with_score(query, k=top_k)
        
        # 2. Sparse Retrieval (BM25)
        tokenized_query = query.split(" ")
        sparse_scores = self.bm25.get_scores(tokenized_query)
        sparse_results = [{"doc": doc, "score": score} for doc, score in zip(self.bm25_corpus, sparse_scores)]
        sparse_results = sorted(sparse_results, key=lambda x: x["score"], reverse=True)[:top_k]

        # 3. Reciprocal Rank Fusion (RRF) for Hybrid Reranking
        # A simple mathematical way to merge ranks without a heavy neural CrossEncoder
        rrf_scores = {}
        
        # Score Dense
        for rank, (doc, _) in enumerate(dense_results):
            doc_id = doc.metadata.get("doc_id")
            if doc_id not in rrf_scores:
                rrf_scores[doc_id] = {"content": doc.page_content, "metadata": doc.metadata, "score": 0}
            rrf_scores[doc_id]["score"] += 1.0 / (60 + rank)
            
        # Score Sparse
        for rank, res in enumerate(sparse_results):
            doc_id = res["doc"]["metadata"].get("doc_id")
            if doc_id not in rrf_scores:
                rrf_scores[doc_id] = {"content": res["doc"]["content"], "metadata": res["doc"]["metadata"], "score": 0}
            rrf_scores[doc_id]["score"] += 1.0 / (60 + rank)
            
        # Sort and return
        fused = sorted(rrf_scores.values(), key=lambda x: x["score"], reverse=True)
        return fused[:top_k]

# Singleton instance
retriever = RetrievalService()

def hybrid_search(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    return retriever.hybrid_search(query, top_k)
