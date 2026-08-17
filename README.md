# JARVIS — Voice-Enabled RAG Assistant

> A voice-first AI assistant that listens, retrieves, reasons, and responds using grounded knowledge from a multilingual retrieval system.

JARVIS is a voice-enabled Retrieval-Augmented Generation (RAG) assistant built for the **HH Goa 2026 Shortlisting Task 2**.

Instead of treating voice as a simple wrapper around a chatbot, JARVIS combines:

**Voice → Speech-to-Text → Intelligent Chunking → Vector Retrieval → Grounded Generation → Voice Response**

The goal is to make interacting with AI feel natural while keeping responses fast, contextual, and grounded in retrieved information.

---

## ✨ What is JARVIS?

JARVIS is designed as a general-purpose AI assistant with a voice-first interface.

Users can simply speak a question and JARVIS handles the complete pipeline:

1. 🎙️ Capture the user's voice
2. 📝 Convert speech into text
3. 🔎 Retrieve relevant information from the knowledge base
4. 🧠 Generate an answer using retrieved context
5. 🛡️ Validate that the response is grounded
6. 🔊 Return the response to the user

The interface is centered around a living particle orb that visually represents the assistant's state.

---

## 🚀 Core Features

### 🎙️ Voice-First Interaction

Users can communicate naturally through their microphone instead of typing.

The assistant provides visual feedback for different stages:

```text
IDLE
 ↓
LISTENING
 ↓
PROCESSING
 ↓
RETRIEVING
 ↓
ANSWERING