import OpenAI from "openai";

// process.env.GROQ_MODEL lets this be swapped without a code change;
// "openai/gpt-oss-120b" is confirmed available on our Groq account
// (llama-3.3-70b-versatile 404'd — account doesn't have that tier).
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Shared by every route that talks to Groq (app/api/generate-question,
// app/api/summarize-profile) so the base URL and key handling live in one
// place. Throws if the key is missing — callers decide how to surface that.
export function getGroqClient(): OpenAI {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }
  return new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey });
}
