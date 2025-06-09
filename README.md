This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, set up your environment variables:

1. Copy `.env.example` to `.env.local` and fill in the required values
2. Get API keys for the following AI providers:
   - [OpenRouter](https://openrouter.ai/) (for accessing multiple free models)
   - [Groq](https://groq.com/) (for Llama 3.3 70B model)
   - [Together.ai](https://together.ai/) (for Mixtral model)
   - [SerpAPI](https://serpapi.com/) (for Google Scholar search capabilities)

**IMPORTANT:** For the multi-agent system to work, you need at least one of these:
- `GROQ_API_KEY` (preferred for best performance)
- `TOGETHER_API_KEY` (as fallback)

The Google Scholar search requires:
- `SERPAPI_API_KEY`

Without these keys, the system will fall back to using only Wikipedia search.

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## AI Providers Configuration

This project uses multiple AI providers to deliver comprehensive research results. You'll need to set up API keys for each:

### OpenRouter
- Sign up at [https://openrouter.ai/](https://openrouter.ai/)
- Create an API key in your account dashboard
- Add to `.env.local` as `OPENROUTER_API_KEY`
- This gives you access to multiple free models including:
  - deepseek/deepseek-r1-0528-qwen3-8b:free
  - mistralai/devstral-small:free
  - meta-llama/llama-3.3-8b-instruct:free
  - qwen/qwen3-30b-a3b:free
  - and more!

### Groq
- Sign up at [https://groq.com/](https://groq.com/)
- Create an API key from your dashboard
- Add to `.env.local` as `GROQ_API_KEY`
- **Required for optimal performance of the Expert Comparison feature**

### Together.ai
- Sign up at [https://together.ai/](https://together.ai/)
- Generate an API key from your account
- Add to `.env.local` as `TOGETHER_API_KEY`
- Can be used as a fallback for the Expert Comparison feature

### SerpAPI (Google Scholar)
- Sign up at [https://serpapi.com/](https://serpapi.com/)
- Create an API key from your dashboard
- Add to `.env.local` as `SERPAPI_API_KEY`
- **Required for Google Scholar search in the Expert Comparison feature**

## Features

### Multi-Model Research
Compare responses from multiple AI models to get comprehensive insights on your research topics.

### Advanced Agent Research
Use our advanced LangChain-powered multi-agent system with specialized research agents, Wikipedia search, Google Scholar, and human-in-the-loop capabilities for complex research tasks.

### Expert Comparison System
The Expert Comparison feature uses a multi-agent system with specialized agents for different research sources. It explicitly highlights contradictions between different sources, providing a more nuanced understanding of complex topics.

## Troubleshooting

### API Key Issues
If you encounter errors related to API keys:
1. Check that you've added the correct keys to `.env.local`
2. Verify that your API keys are valid and have not expired
3. Ensure you have sufficient credits on your API provider accounts

### "Invalid API Key" Error
This typically means one of your API keys is not valid. Check the specific provider mentioned in the error message and update the key in your `.env.local` file.

### Groq API Issues
If you encounter issues with the Groq API:
1. Verify your API key is correct in `.env.local`
2. Check that you have sufficient quota on your Groq account
3. The system will automatically fall back to Together.ai if Groq is unavailable

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
