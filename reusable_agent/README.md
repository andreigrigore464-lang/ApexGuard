# 🏎️ Reusable Agent Decision Pattern — Strands Decider 2B + Amazon Bedrock

This standalone module implements the **Two-Tier Fast-Gatekeeper & Judicial Synthesis** pattern submitted for the **AWS Builder Center — Agent Experience Hackathon: Strands Decider**.

---

## 💡 Architecture & Classification

```
   Raw High-Velocity Telemetry (20Hz)
                  │
                  ▼
   ┌─────────────────────────────┐
   │    Layer 1: NumPy Math      │  --> Continuous separation, overlap %, closing velocity
   └──────────────┬──────────────┘
                  │ Physical State Vector
                  ▼
   ┌─────────────────────────────┐
   │  Layer 2: Strands Decider   │  --> System 1: Typed Decision Tree (~115ms)
   │     (2B Model / Rules)      │      [bool] Is actionable?
   └──────────────┬──────────────┘      [choice] Fault attribution?
                  │                     [score] Severity (1-5)?
                  │ (Only if Actionable Infringement)
                  ▼
   ┌─────────────────────────────┐
   │   Layer 3: Amazon Bedrock   │  --> System 2: Judicial Text Synthesis
   │      (Amazon Nova Lite)     │      Official FIA Stewards' Decision Document
   └─────────────────────────────┘
```

---

## 🚀 Quickstart

Run directly with zero dependencies beyond standard Python:

```bash
python reusable_agent/decider_agent.py
```

### With Cloud Credentials
To activate live cloud inference, set the appropriate environment variables:

```bash
# AWS Bedrock Credentials
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
export AWS_REGION="us-east-1"
export BEDROCK_MODEL_ID="amazon.nova-lite-v1:0"

# Optional: Strands Decider API
export STRANDS_DECIDER_API_KEY="your_strands_key"
```

If credentials are omitted, the agent automatically executes with **local deterministic rulebook fallbacks** at **$0 cost** and **zero downtime**.

---

## ⚖️ Disclaimer & Non-Affiliation
*ApexGuard is an independent open-source educational prototype created for the AWS Builder Center Agent Experience Hackathon. Formula 1, F1, and FIA are registered trademarks of their respective owners and are referenced solely for technical evaluation under nominative fair use. Signatories represent simulated regulatory roles rather than individual endorsements.*
