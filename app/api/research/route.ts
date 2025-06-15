import { NextRequest, NextResponse } from "next/server";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";

// Updated multi-LLM research configuration with free models
const RESEARCH_MODELS = [
  {
    name: "qwen3-30b-a3b",
    model: "qwen/qwen3-30b-a3b:free",
    specialty: "Advanced reasoning and analysis",
    prompt: (query: string) => `As a research specialist, provide a concise analysis of: ${query}. Focus on logical connections and key insights.`
  },
  {
    name: "llama-3.3-8b-instruct",
    model: "meta-llama/llama-3.3-8b-instruct:free",
    specialty: "Instruction-based synthesis",
    prompt: (query: string) => `As a synthesis expert, provide a concise overview of: ${query}. Include key points and context.`
  },
  {
    name: "deepseek-r1-0528-qwen3-8b",
    model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
    specialty: "Hybrid reasoning and evaluation",
    prompt: (query: string) => `As an evaluation expert, assess: ${query}. Provide brief perspectives and insights.`
  },
  {
    name: "deepseek-r1-0528",
    model: "deepseek/deepseek-r1-0528:free",
    specialty: "Deep reasoning",
    prompt: (query: string) => `As a deep reasoning specialist, explain: ${query}. Focus on clarity and logical depth.`
  }
];

// Utility function to execute LLM request with timeout, retry, and delay
async function executeLLMRequest(config: typeof RESEARCH_MODELS[0], query: string, attempt = 1, maxAttempts = 3, delay = 1000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
  
  try {
    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY || "",
    });
    
    const response = await streamText({
      model: openrouter(config.model),
      prompt: config.prompt(query),
      maxTokens: 500, // Reduced to lessen load
    });
    
    const result = await response.text;
    clearTimeout(timeoutId);
    return {
      success: true,
      model: config.name,
      specialty: config.specialty,
      content: result,
      timestamp: new Date().toISOString()
    };
  } catch (error : any) {
    clearTimeout(timeoutId);
    if (attempt < maxAttempts && (error.name === "AbortError" || error.message.includes("rate"))) {
      console.warn(`Retrying ${config.name} (Attempt ${attempt + 1}/${maxAttempts}) due to: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt))); // Exponential backoff
      return executeLLMRequest(config, query, attempt + 1, maxAttempts, delay);
    }
    console.error(`Error with ${config.name} after ${maxAttempts} attempts:`, error);
    return {
      success: false,
      model: config.name,
      specialty: config.specialty,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Enhanced NLP summarization with weighted scoring
function enhancedSummarization(responses: any[], query: string) {
  const successfulResponses = responses.filter(r => r.success);
  
  if (successfulResponses.length === 0) {
    return "No successful responses received from the research models. Possible rate limiting or API issues.";
  }
  
  const allSentences = successfulResponses.flatMap(response => 
    response.content.split(/[.!?]+/)
      .filter(s => s.trim().length > 50)
      .map(s => ({
        text: s.trim(),
        source: response.model,
        specialty: response.specialty
      }))
  );
  
  const scoredSentences = allSentences.map(sentence => {
    const queryWords = query.toLowerCase().split(' ');
    const sentenceWords = sentence.text.toLowerCase().split(' ');
    
    const relevanceScore = queryWords.reduce((score, word) => 
      score + (sentenceWords.includes(word) ? 1 : 0), 0) / queryWords.length;
    
    const lengthScore = Math.min(sentence.text.length / 200, 1);
    
    return {
      ...sentence,
      score: relevanceScore * 0.7 + lengthScore * 0.3
    };
  });
  
  const topSentences = scoredSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .sort((a, b) => a.source.localeCompare(b.source));
  
  return topSentences.map(s => `${s.text} [Source: ${s.specialty}]`).join('\n\n');
}

// Generate comprehensive research report
function generateResearchReport(query: string, responses: any[], summary: string) {
  const timestamp = new Date().toLocaleString("en-US", { 
    timeZone: "Asia/Kolkata", 
    hour12: true 
  });
  
  const successfulModels = responses.filter(r => r.success);
  const failedModels = responses.filter(r => !r.success);
  
  return `
# Multi-LLM Research Report: ${query.charAt(0).toUpperCase() + query.slice(1)}

**Generated:** ${timestamp} IST  
**Research Models Used:** ${successfulModels.length}/${responses.length} successful  
**Research Methodology:** Sequential multi-model synthesis with specialized prompting

## Executive Summary

${summary}

## Detailed Analysis by Specialty

${successfulModels.map(response => `
### ${response.specialty} (${response.model})
${response.content.substring(0, 500)}... [Truncated for brevity]
`).join('\n')}

## Research Methodology

This research employed a sequential multi-model approach, querying ${RESEARCH_MODELS.length} specialized free-tier AI models with delays to manage rate limits:

${RESEARCH_MODELS.map(model => `- **${model.name}**: ${model.specialty}`).join('\n')}

Each model received a tailored prompt, with retries for rate limit handling.

## Model Performance Summary

- **Successful responses:** ${successfulModels.length}
- **Failed responses:** ${failedModels.length}
${failedModels.length > 0 ? `- **Failed models:** ${failedModels.map(m => m.model).join(', ')}` : ''}

## Conclusion

This report provides a multi-faceted analysis of ${query.toLowerCase()} using free-tier models, though limited by potential rate constraints. Consider upgrading your OpenRouter plan for full access.

---
*Generated by Multi-LLM Research Agent v2.0*
  `.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = body.query?.trim() || "";

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter is required" }, 
        { status: 400 }
      );
    }
    
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OpenRouter API key not configured" }, 
        { status: 500 }
      );
    }
    
    console.log(`Starting multi-LLM research for: "${query}" at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true })}`);
    
    // Sequential calls with delay to avoid rate limits
    const responses = [];
    for (const model of RESEARCH_MODELS) {
      console.log(`Processing ${model.name} at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true })}`);
      const result = await executeLLMRequest(model, query);
      responses.push(result);
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay between calls
    }
    
    console.log(`Research completed. Successful: ${responses.filter(r => r.success).length}/${responses.length} at ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true })}`);
    
    const enhancedSummary = enhancedSummarization(responses, query);
    const researchReport = generateResearchReport(query, responses, enhancedSummary);
    
    return NextResponse.json({ 
      result: researchReport,
      metadata: {
        totalModels: RESEARCH_MODELS.length,
        successfulModels: responses.filter(r => r.success).length,
        failedModels: responses.filter(r => !r.success).length,
        timestamp: new Date().toISOString(),
        query: query
      }
    });
  } catch (error : any) {
    console.error("Multi-LLM Research Error at", new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: true }), ":", error);
    return NextResponse.json(
      { error: `Research failed: ${error.message}. Possible rate limiting. Consider reducing model count or upgrading your OpenRouter plan.` }, 
      { status: 500 }
    );
  }
}