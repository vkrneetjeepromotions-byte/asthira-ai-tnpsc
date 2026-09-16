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

    const prompt = `
You are ASTHIRA AI, an expert TNPSC question-paper setter and reviewer.

Generate exactly ${n} ORIGINAL questions.
Exam: ${exam}
Subject: ${subject}
Topic: ${topic || "General"}
Difficulty: ${difficulty}
Language: ${language}
Question type: ${questionType}

ADVANCED TNPSC QUALITY STANDARD
- Match the style and depth expected in competitive TNPSC examinations.
- For Very Tough/Tough, prefer conceptual, analytical, application-based, comparison, chronology, constitutional provision, committee/report, cause-effect, exception, and statement-elimination questions where appropriate.
- Do not make questions difficult merely by using obscure or ambiguous wording.
- Every question must have ONE clearly defensible correct answer.
- All four options must be plausible, relevant, grammatically parallel, and independently meaningful.
- Do not use "all of the above", "none of the above", or giveaway wording.
- Avoid predictable answer-letter patterns. Distribute A/B/C/D naturally across the full set.
- Do not repeat the same fact, article, case, date, person, concept, or reasoning pattern unless the distinction is genuinely different.
- Before finalizing, internally check every question for factual accuracy, uniqueness, ambiguity, and option quality.
- Never invent facts. If a detail is uncertain, choose a well-established fact instead.
- For Indian Polity, use the correct constitutional Article/Part/Schedule/amendment/case distinction where relevant.
- For History, distinguish dates, personalities, movements, sources, chronology and causes accurately.
- For Geography, use accurate physical, economic and environmental relationships.
- For Economy and Science, use technically correct terminology and avoid misleading simplifications.

QUESTION TYPE
MCQ:
- One best answer with four options.

Assertion-Reason:
- Write a clear Assertion and Reason.
- Options must represent the four standard combinations:
  A. Both true and Reason correctly explains Assertion
  B. Both true but Reason does not correctly explain Assertion
  C. Assertion true, Reason false
  D. Assertion false, Reason true

Statement Based:
- Use 2–4 numbered statements.
- Ask which statements are correct/incorrect.
- Options must encode the combinations clearly.

Match the Following:
- Use two lists with meaningful pairs.
- Provide four answer-code combinations.

LANGUAGE AND TAMIL STYLE
Tamil:
- Use natural, familiar Tamil that a TNPSC student can easily understand.
- Do NOT translate English sentence-by-sentence or use awkward machine-translation wording.
- Prefer simple, commonly used Tamil words while keeping the meaning academically correct.
- Use established Tamil textbook/exam terminology when it is familiar to students.
- Keep important technical terms in English in brackets when that makes the meaning clearer, e.g. அடிப்படை உரிமைகள் (Fundamental Rights), நீதித்துறை மறுஆய்வு (Judicial Review).
- Avoid overly literary, archaic, Sanskrit-heavy, or uncommon Tamil words when a familiar word is available.
- Keep question wording short, natural and suitable for a Tamil-medium competitive-exam student.
- Explanations should sound like a good Tamil teacher explaining the answer, not like a literal translation.
- Do not change the factual meaning merely to simplify the language.

English: Use formal exam-quality English.
Bilingual:
- Give natural Tamil first, followed by the English equivalent where useful.
- Do not produce a word-for-word translation.
- Keep important technical terms in both Tamil and English when helpful.

ANSWER REQUIREMENT
- "answer" must be the complete text of the correct option.
- "answerLetter" must be exactly A, B, C, or D.
- "explanation" must explain why the answer is correct and briefly identify the key distinction.
- Where applicable, mention the relevant constitutional Article, amendment, case, committee, date, or standard reference in the explanation.

If study material is supplied, treat it as the primary reference. Do not contradict it. Generate questions from the supplied material when possible.

Return ONLY JSON matching the schema.
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
      text: prompt
    });

    const schema = {
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
              answerLetter: {
                type: "string",
                enum: ["A", "B", "C", "D"]
              },
              explanation: { type: "string" }
            },
            required: [
              "question",
              "options",
              "answer",
              "answerLetter",
              "explanation"
            ]
          }
        }
      },
      required: ["questions"]
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        instructions: "Return only valid JSON matching the supplied schema.",
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "advanced_tnpsc_questions",
            strict: true,
            schema
          }
        },
        max_output_tokens: Math.min(50000, Math.max(5000, n * 360)),
        store: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI API request failed."
      });
    }

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
        error: "OpenAI returned no text output."
      });
    }

    let result;
    try {
      result = JSON.parse(outputText);
    } catch (e) {
      return res.status(500).json({
        error: "OpenAI returned invalid JSON."
      });
    }

    if (!Array.isArray(result.questions) || result.questions.length !== n) {
      return res.status(500).json({
        error: `AI returned ${result.questions?.length || 0} questions instead of ${n}.`
      });
    }

    // Server-side validation: exactly 4 options and a valid answer letter.
    for (const q of result.questions) {
      if (
        !q.question ||
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        !q.answer ||
        !["A", "B", "C", "D"].includes(q.answerLetter) ||
        !q.explanation
      ) {
        return res.status(500).json({
          error: "One or more generated questions failed quality validation."
        });
      }

      const uniqueOptions = new Set(
        q.options.map(x => String(x).trim().toLowerCase())
      );

      if (uniqueOptions.size !== 4) {
        return res.status(500).json({
          error: "A generated question contains duplicate options. Please generate again."
        });
      }

      const idx = ["A", "B", "C", "D"].indexOf(q.answerLetter);
      if (q.answer.trim() !== q.options[idx].trim()) {
        return res.status(500).json({
          error: "Answer and answer letter did not match. Please generate again."
        });
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error?.message || "Server error"
    });
  }
}
