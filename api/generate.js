export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured in Vercel."
      });
    }

    const {
      exam = "TNPSC Group 2",
      subject = "Indian Polity",
      topic = "",
      difficulty = "Tough",
      language = "Bilingual",
      questionType = "MCQ",
      count = 10,
      fileName = "",
      fileData = ""
    } = req.body || {};

    const n = Math.max(1, Math.min(200, Number(count) || 10));

    const instructions = `
You are ASTHIRA AI, an expert TNPSC competitive examination question setter.

Generate exactly ${n} high-quality questions.

Exam: ${exam}
Subject: ${subject}
Topic: ${topic || "General"}
Difficulty: ${difficulty}
Language: ${language}
Question type: ${questionType}

Rules:
- Follow TNPSC examination standards.
- Questions must be factually accurate.
- Avoid ambiguous questions.
- Use the uploaded study material as the primary source when provided.
- Do not invent facts.
- Give exactly 4 options for every question.
- Give the correct answer.
- Give a concise explanation.

Language:
Tamil = Tamil only.
English = English only.
Bilingual = Tamil and English.

Return only the requested JSON structure.
`;

    const content = [];

    if (fileData) {
      const isPdf =
        fileName.toLowerCase().endsWith(".pdf") ||
        fileData.startsWith("data:application/pdf");

      if (isPdf) {
        content.push({
          type: "input_file",
          filename: fileName || "study-material.pdf",
          file_data: fileData,
          detail: "high"
        });
      } else {
        content.push({
          type: "input_image",
          image_url: fileData,
          detail: "auto"
        });
      }
    }

    content.push({
      type: "input_text",
      text: instructions
    });

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",

          instructions,

          input: [
            {
              role: "user",
              content
            }
          ],

          text: {
            format: {
              type: "json_schema",
              name: "tnpsc_mcqs",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,

                properties: {
                  questions: {
                    type: "array",
                    minItems: n,
                    maxItems: n,

                    items: {
                      type: "object",
                      additionalProperties: false,

                      properties: {
                        question: {
                          type: "string"
                        },

                        options: {
                          type: "array",
                          minItems: 4,
                          maxItems: 4,
                          items: {
                            type: "string"
                          }
                        },

                        answer: {
                          type: "string"
                        },

                        explanation: {
                          type: "string"
                        }
                      },

                      required: [
                        "question",
                        "options",
                        "answer",
                        "explanation"
                      ]
                    }
                  }
                },

                required: ["questions"]
              }
            }
          },

          max_output_tokens: Math.min(
            50000,
            Math.max(5000, n * 250)
          ),

          store: false
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenAI API request failed."
      });
    }

    /*
      Read the raw Responses API structure:
      output → message → content → output_text → text
    */

    let outputText = "";

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (
              part.type === "output_text" &&
              typeof part.text === "string"
            ) {
              outputText += part.text;
            }
          }
        }
      }
    }

    if (!outputText) {
      return res.status(500).json({
        error: "OpenAI returned no text output.",
        status: data.status || "unknown"
      });
    }

    let result;

    try {
      result = JSON.parse(outputText);
    } catch (parseError) {
      return res.status(500).json({
        error: "OpenAI returned invalid JSON.",
        details: parseError.message
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error?.message || "Server error"
    });
  }
}
