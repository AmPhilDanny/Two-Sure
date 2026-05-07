# AI Football Prediction System: Architecture & Logic

This document outlines the professional-grade multi-agent architecture used to predict "2-odd" football outcomes with high accuracy and reliability.

## 1. The AI Agent Team

The system utilizes four specialized agents working in a synchronized pipeline:

| Agent Type | Responsibility | Core Logic |
| :--- | :--- | :--- |
| **The Scraper Agent** | **The Gatherer** | Combines **Professional APIs** (API-Football/StatsBomb) for structured data with **Web Scraping** for real-time odds comparison. |
| **The Analyst Agent** | **The Brain** | Processes raw data and calculates probabilities using a Multi-LLM setup (Gemini, Grok, Mistral). Focuses on Expected Value (EV). |
| **The Validator Agent** | **The Auditor** | Performs daily backtesting. Compares yesterday's predictions against actual results to track ROI and accuracy. |
| **The Health Agent** | **The Sentry** | Monitors system "vitals" such as API rate limits, data freshness, and model drift. |

---

## 2. Hybrid Data Model (API + Scraping)

The system operates on a dual-source data model to maximize accuracy and capture market inefficiencies.

### A. Professional APIs (The Foundation)
Used for high-integrity, structured data:
- **API-Football / StatsBomb**: Provides official results, historical xG (Expected Goals), player injury status, and confirmed lineups.
- **Role**: Provides the "Ground Truth" for calculating a team's statistical strength.

### B. Web Scraping (The Real-Time Market)
Used for capturing the current state of the betting market:
- **Betting Sites**: Fetches the exact "2-odd" prices in real-time.
- **Role**: Captures market movement and price discrepancies that APIs might miss due to latency.

### C. The "Value Gap" Calculation
The system compares the **Statistical Probability** (from APIs) against the **Market Price** (from Scraping). A prediction is only generated if the Market Price offers a higher payout than the statistical probability warrants.

---

## 3. Real-Time Data & Crawling

Unlike static models, the **Scraper Agent** provides a real-time edge:
- **Live Odds**: Fetches current market prices to ensure the "2-odd" target is accurate at the time of prediction.
- **Dynamic Content**: Uses headless browsing to bypass anti-bot measures and scrape news from sources that don't offer APIs.
- **Breaking News**: Captures last-minute injuries or tactical changes that standard data providers might lag on.

---

## 3. Informed Decision Making (Reasoning-Chain)

The **Analyst Agent** does not perform simple classification. It uses **Reasoning-Chain Analysis**:
1. **Context Ingestion**: Feeds the AI historical H2H stats, rolling team form (xG), and market drift.
2. **Probability Calculation**: The AI calculates the "True Probability" of an event.
3. **EV Identification**: The agent identifies a "Value Bet" only when:
   `True Probability > Implied Probability (from Bookmaker Odds)`

---

## 4. Quality Control & Barriers

To prevent "hallucinations" or vague results, the system implements several strict barriers:

### A. The Confidence Threshold
Predictions are rejected if the AI's internal confidence score falls below a predefined threshold (e.g., 75%).

### B. Multi-LLM Consensus
The system can be configured to require agreement from at least two different AI models (e.g., Gemini and Grok) before a pick is finalized.

### C. The Accuracy Kill-Switch (Validator)
If the **Validator Agent** detects that accuracy has dropped below a critical level (e.g., 65%), it can:
- Force a switch to a different AI provider.
- Alert the user to refine the analysis prompt.
- Pause predictions to prevent losses.

### D. Data Freshness Check (Health)
The **Health Agent** ensures no prediction is made using data older than a set timeframe (e.g., 4 hours), preventing decisions based on stale odds or outdated team news.

---

## 5. Technology Stack
- **Framework**: Next.js 15 (TypeScript)
- **AI Models**: Gemini 1.5 Pro, Grok (xAI), Mistral
- **Automation**: Railway (Background Tasks), Vercel (Frontend/API)
- **Scraping**: Playwright / Cheerio
