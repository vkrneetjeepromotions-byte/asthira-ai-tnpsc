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
You are ASTHIRA AI, an expert TNPSC competitive-exam question setter.

Generate exactly ${n} high-quality questions for:
Exam: ${exam}
Subject: ${subject}
Topic: ${topic || "As specified in the uploaded material"}
Difficulty: ${difficulty}
Language: ${language}
Question type: ${questionType}

Follow TNPSC-style standards.
Questions must be factually accurate, unambiguous and exam-oriented.
Use the uploaded study material as the primary source when provided.
Do not invent facts.

For every question provide:
- question
- exactly 4 options
- answer
- concise explanation

For Assertion-Reason questions, use standard Assertion and Reason format.
For Statement Based questions, clearly label statements.
For Match the Following, provide appropriate matching options.

Language rules:
Tamil = Tamil only.
English = English only.
Bilingual = Tamil + English.

Return ONLY the requested structured JSON.
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

    const response = await fetch("https://api.openai.com/v1/responses", {
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
                      question: { type: "string" },
                      options: {
                        type: "array",
                        minItems: 4,
                        maxItems: 4,
                        items: { type: "string" }
                      },
                      answer: { type: "string" },
                      explanation: { type: "string" }
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
        max_output_tokens: Math.min(50000, Math.max(5000, n * 250)),
        store: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenAI API request failed."
      });
    }

    let result;

    if (data.output_text) {
      result = JSON.parse(data.output_text);
    } else {
      return res.status(500).json({
        error: "No structured output received from OpenAI."
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
