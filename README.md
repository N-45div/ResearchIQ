# 🧠 ResearchIQ – Voice-Powered Research Assistant

---

## 🔑 Key Features

* 🗣️ Voice (Vapi AI)
* 🤖 Supervisor agent via LangGraph
* 🔍 Research agent (Wikipedia, Google Scholar) with HITL
* 💡 Reasoning agent for intelligent synthesis
* 🎤 VoiceXpert mode for source comparison
* ⏱️ Rate limiting via Upstash Redis
* 🔄 Free-tier OpenRouter LLMs

---

## 🧰 Tech Stack

* **Frontend:** Next.js 15.3.3, React, Tailwind CSS
* **Backend:** Next.js API Routes
* **AI Frameworks:** LangChain.js, LangGraph.js
* **LLMs:** OpenRouter (free models)
* **Voice:** Vapi AI
* **Rate Limiting:** Upstash Redis
* **Deployment:** Vercel

---

## 🚀 Getting Started

### Prerequisites

* Node.js (>=18.x)
* npm
* Git
* Upstash Redis
* API keys for:

  * OpenRouter
  * SerpAPI
  * Vapi AI

### Installation

```bash
git clone https://github.com/N-45div/ResearchIQ.git
cd ResearchIQ
npm install
```

### Environment Variables

Create a `.env.local` file from `.env.example` and fill in:

```
OPENROUTER_API_KEY=
SERPAPI_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_VAPI_API_KEY=
NEXT_PUBLIC_VAPI_ASSISTANT_ID=
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🛠 Troubleshooting

* Ensure all API keys are correctly set in `.env.local`
* If getting HTTP 429 (rate limit), reduce model usage or increase delay
* Check console/network logs for additional context

---

## ⚙️ Performance Tips

* Free-tier OpenRouter models may rate-limit. Tweak usage in `/app/api/research/route.ts`
* Consider upgrading API plans for production-scale usage
* Monitor usage logs during peak times

---

## 🚢 Deployment

* Recommended: [Vercel](https://vercel.com/)

  * Connect GitHub repo
  * Set environment variables
  * Auto-build on push (`npm run build`)

---

## 🤝 Contributing

1. Fork the repo
2. Create a branch: `feature/your-feature`
3. Commit and push changes
4. Submit a pull request
5. Report bugs or suggest features via GitHub Issues

---

## 🪪 License

MIT License – see [LICENSE](LICENSE)
