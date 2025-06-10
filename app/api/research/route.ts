import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js'; // Keep for potential future use if route needs user context beyond rate limiting
import { Mistral } from '@mistralai/mistralai';
import { Groq } from 'groq-sdk';

// Initialize LLM clients
let mistral: Mistral | null = null;
try {
    mistral = new Mistral({
        apiKey: process.env.MISTRAL_API_KEY || '',
    });
} catch (error) {
    console.error('Failed to initialize Mistral client:', error);
}

let groq: Groq | null = null;
try {
    groq = new Groq({
        apiKey: process.env.GROQ_API_KEY || '',
    });
} catch (error) {
    console.error('Failed to initialize Groq client:', error);
}

export async function POST(req: NextRequest) {
    try {
        const { query } = await req.json();
        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        // Initialize response object
        const responses: Record<string, string> = {};

        // Process with Mistral (if available)
        if (mistral) {
            try {
                const mistralResponse = await mistral.chat.complete({
                    model: 'mistral-large-latest',
                    messages: [{ role: 'user', content: query }],
                });

                // Extract message content and handle different content types
                responses.mistral = typeof mistralResponse.choices[0].message.content === 'string'
                    ? mistralResponse.choices[0].message.content
                    : JSON.stringify(mistralResponse.choices[0].message.content);
            } catch (error) {
                console.error('Error calling Mistral API:', error);
                responses.mistral = "Sorry, there was an error processing your request with Mistral.";
            }
        }

        // Process with Groq (if available)
        if (groq) {
            try {
                const groqResponse = await groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: query }],
                });

                responses.groq = groqResponse.choices[0].message.content || '';
            } catch (error) {
                console.error('Error calling Groq API:', error);
                responses.groq = "Sorry, there was an error processing your request with Groq.";
            }
        }

        // Process with Together.ai using fetch directly
        try {
            if (process.env.TOGETHER_API_KEY) {
                const togetherPrompt = `Research the following topic thoroughly: ${query}`;
                const togetherResponse = await fetch("https://api.together.xyz/v1/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
                        prompt: togetherPrompt,
                        max_tokens: 1000,
                        temperature: 0.7
                    })
                }).then(res => res.json());

                responses.together = togetherResponse.choices?.[0]?.text || '';
            }
        } catch (error) {
            console.error('Error calling Together.ai API:', error);
            responses.together = "Sorry, there was an error processing your request with Together.ai.";
        }

        // Search CrossRef for relevant academic papers using fetch directly
        let academicPapers = [];
        try {
            const crossrefResponse = await fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=5&sort=relevance&order=desc`);
            const crossrefData = await crossrefResponse.json();

            if (crossrefData && crossrefData.message && Array.isArray(crossrefData.message.items)) {
                academicPapers = crossrefData.message.items;
            }
        } catch (error) {
            console.error('Error fetching CrossRef data:', error);
        }

        // Extract key points and differences between responses for comparison
        const differences = await analyzeResponseDifferences(
            responses.mistral || '',
            responses.groq || '',
            responses.together || '',
            ''
        );

        // Combine results
        const results = {
            ...responses,
            academic: academicPapers,
            differences
        };

        return NextResponse.json(results);
    } catch (error) {
        console.error('Research API error:', error);
        return NextResponse.json(
            { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
            { status: 500 }
        );
    }
}

// Function to analyze differences between model responses
async function analyzeResponseDifferences(
    mistralResponse: string,
    groqResponse: string,
    togetherResponse: string,
    togetherResponse2: string
) {
    // In a production scenario, we could use another LLM call to analyze differences
    // For now, return a simple structure with responses to compare
    return {
        sourcesUsed: {
            mistral: !!mistralResponse,
            groq: !!groqResponse,
            together: !!togetherResponse,
            together2: !!togetherResponse2
        },
        summary: "Multiple AI models were consulted to provide comprehensive research results. Review each response to see different perspectives and information.",
        hasDifferences: true,
        keyPoints: {
            commonPoints: [
                "All models provided information on the requested topic",
                "Results may contain different perspectives"
            ],
            potentialDifferences: [
                "Models may cite different sources or research",
                "Numerical data or statistics may vary between models",
                "Analysis and conclusions might differ based on each model's training data"
            ]
        }
    };
} 