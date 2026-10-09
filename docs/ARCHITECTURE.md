# Architecture Specification: Offline Transit AI Assistant (React Native)

## 1. System Overview

The application is an entirely offline, on-device conversational AI assistant for Philippine transit routing (e.g., provincial buses, terminals, transfers, MRT/LRT/EDSA Carousel, jeepneys).

```mermaid
flowchart TD
    User(["User Query\n(e.g., 'How to go from Lucena to SM Makati?')"]) --> UI["React Native Chat UI (TypeScript)"]
    
    subgraph ClientDevice ["On-Device Mobile Environment (Android / iOS)"]
        UI --> Orchestrator["Transit Orchestrator / Pipeline"]
        
        subgraph Engine ["Local AI & Knowledge Engine"]
            Orchestrator --> LLM_Parser["Local SLM Parser\n(Qwen2.5-1.5B-Instruct via react-native-llama)"]
            LLM_Parser -- "Extracted Intent & Entities\n(Origin: Lucena, Dest: SM Makati)" --> QueryBuilder["Route Resolver & Query Builder"]
            
            QueryBuilder --> LocalDB[("Local Transit Database\n(SQLite + FTS5 + Route Graph)")]
            LocalDB -- "Verified Bus Lines, Terminals, Transfers" --> SynthesizerContext["Context Packager"]
            
            SynthesizerContext --> LLM_Gen["Local SLM Response Synthesizer\n(Zero-hallucination Prompt)"]
        end
        
        LLM_Gen -- "Streamed Output (Tokens)" --> UI
    end
```

---

## 2. Core Constraints & Technical Budgets

| Parameter | Specification | Rational / Mitigation |
| :--- | :--- | :--- |
| **Target Model** | `Qwen2.5-1.5B-Instruct` (or `Qwen2.5-0.5B` for budget devices, `3B` for flagships) | High reasoning-to-parameter ratio, strong multi-lingual comprehension (English & Tagalog). |
| **Quantization Format** | GGUF Q4_K_M or Q4_0 | Fits under ~1.2 GB RAM footprint, avoiding iOS/Android Low Memory Killer (OOM). |
| **Inference Engine** | `react-native-llama` (GGML / llama.cpp) | Direct C++ JSI bindings, GPU acceleration via Metal (iOS) and Vulkan/OpenCL (Android). |
| **Context Window** | 2048 tokens (sliding context) | Keeps KV-cache small (~100–150 MB) to maximize performance. |
| **Offline Storage** | SQLite (`react-native-quick-sqlite` or `op-sqlite`) | High performance C++ SQLite engine with FTS5 search. |
| **App Initial Download** | App binary: ~30–45 MB<br>Model weights: ~980 MB – 1.8 GB | Downloaded on first setup over Wi-Fi, or side-loaded, stored in App Sandbox document directory. |

---

## 3. Data Flow & Hybrid Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Chat UI
    participant Orch as Transit Orchestrator
    participant LLM as react-native-llama (SLM)
    participant DB as SQLite Local Transit DB

    User->>UI: "How to commute from Lucena to SM Makati?"
    UI->>Orch: submitMessage(text)
    
    rect rgb(240, 248, 255)
        note over Orch, LLM: Step 1: Entity Extraction
        Orch->>LLM: Prompt to extract JSON: {origin, destination, time_preference}
        LLM-->>Orch: {"origin": "Lucena", "destination": "SM Makati"}
    end
    
    rect rgb(245, 255, 245)
        note over Orch, DB: Step 2: Deterministic Route Resolution
        Orch->>DB: FTS5 search terminals for "Lucena" (Grand Central Terminal)
        Orch->>DB: FTS5 search landmark for "SM Makati" (Ayala Station / Makati CBD)
        Orch->>DB: Query route graph (Lucena -> Buendia / PITX -> MRT-3 / EDSA)
        DB-->>Orch: Returns verified legs, bus lines (JAC/DLTB), stops, estimated fares
    end
    
    rect rgb(255, 250, 245)
        note over Orch, LLM: Step 3: Natural Language Response Synthesis
        Orch->>LLM: Prompt with verified route data as ground truth
        LLM-->>UI: Streamed conversational directions in Taglish/English
    end
    
    UI-->>User: Displays friendly, step-by-step verified transit guide
```

---

## 4. Security & Offline Guarantee

* **100% Airplane Mode Functional**: Zero telemetry or external API calls required for operation.
* **No Cloud Dependency**: All GGUF tensors and SQLite tables reside inside the application's isolated sandboxed storage.
* **Storage Hygiene**: Model file validation via SHA-256 checksum prior to loading into memory.
