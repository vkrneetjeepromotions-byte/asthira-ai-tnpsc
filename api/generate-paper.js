export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured."
      });
    }

    const body = req.body || {};

    const exam = body.exam || "";
    const subject = body.subject || "";
    const chapter = body.chapter || body.topic || "";
    const difficulty = body.difficulty || "Very Tough";
    const language = body.language || "Tamil";

    const counts = body.questionCounts || {};

    const types = [
      "MCQ",
      "Assertion–Reason",
      "Statement Based",
      "Numerical",
      "Case Based",
      "Previous Year Question",
      "1 Mark Questions",
      "2 Mark Questions",
      "3 Mark Questions",
      "4 Mark Questions",
      "5 Mark Questions"
    ];

    const cleanCounts = {};

    types.forEach(type => {
      cleanCounts[type] = Math.max(
        0,
        Math.min(200, Number(counts[type]) || 0)
      );
    });

    const totalQuestions = Object.values(cleanCounts)
      .reduce((a, b) => a + b, 0);

    if (!totalQuestions) {
      return res.status(400).json({
        error: "Please enter the number of questions for at least one question type."
      });
    }

    if (totalQuestions > 200) {
      return res.status(400).json({
        error: "Maximum 200 questions per paper."
      });
    }

    const totalMarks =
      cleanCounts["1 Mark Questions"] * 1 +
      cleanCounts["2 Mark Questions"] * 2 +
      cleanCounts["3 Mark Questions"] * 3 +
      cleanCounts["4 Mark Questions"] * 4 +
      cleanCounts["5 Mark Questions"] * 5;

    const distribution = types
      .filter(type => cleanCounts[type] > 0)
      .map(type => `${type}: ${cleanCounts[type]}`)
      .join("\n");

    const prompt = `
You are ASTHIRA AI, an expert question-paper setter.

Create a complete question paper.

Exam/Board: ${exam}
Subject: ${subject}
Chapter/Portion: ${chapter || "Full Portion"}
Difficulty: ${difficulty}
Language: ${language}

EXACT QUESTION DISTRIBUTION:
${distribution}

TOTAL QUESTIONS: ${totalQuestions}
TOTAL MARKS FROM MARKED SECTIONS: ${totalMarks}

IMPORTANT:
1. Generate EXACTLY the requested number for EVERY question type.
2. Do not add extra questions.
3. Do not omit any requested question type.
4. Do not duplicate questions.
5. Questions must match the selected exam, subject and chapter/portion.
6. For full-portion requests, distribute questions across the supplied portion appropriately.

QUESTION TYPES:

MCQ:
- Four meaningful options.
- One clearly correct answer.

Assertion–Reason:
- Give Assertion and Reason.
- Four standard answer options.

Statement Based:
- Use numbered statements.
- Give four answer options representing combinations.

Numerical:
- Create a calculation/problem-solving question.
- Give four options where appropriate.
- Ensure the numerical answer is correct.

Case Based:
- Provide a realistic passage/case.
- Questions must be based on the case.

Previous Year Question:
- Use a genuine known previous-year question only when you are confident.
- Never invent a question and call it an actual previous-year question.

1 Mark Questions:
- Short-answer style.
- marks = 1.

2 Mark Questions:
- Short-answer style.
- marks = 2.

3 Mark Questions:
- Short/medium descriptive answer.
- marks = 3.

4 Mark Questions:
- Analytical/descriptive answer.
- marks = 4.

5 Mark Questions:
- Detailed analytical/descriptive answer.
- marks = 5.

MARK SECTION RULE:
Every 1–5 mark question must have its correct marks value.

SECTION RULE:
1 Mark Questions → Section A
2 Mark Questions → Section B
3 Mark Questions → Section C
4 Mark Questions → Section D
5 Mark Questions → Section E

Other question types must keep their original questionType.

QUALITY:
- No ambiguous questions.
- No repeated concepts.
- No invented facts.
- Use accurate textbook/exam terminology.
- For Tamil, use natural familiar Tamil suitable for students.
- For Bilingual, give natural Tamil and English.
- Explanations must be accurate.
`;

    const content = [];

    if (body.fileData) {
      const fileName = body.fileName || "";

      if (
        fileName.toLowerCase().endsWith(".pdf") ||
        body.fileData.startsWith("data:application/pdf")
      ) {
        content.push({
          type: "input_file",
          filename: fileName || "study-material.pdf",
          file_data: body.fileData,
          detail: "high"
        });
      } else {
        content.push({
          type: "input_image",
          image_url: body.fileData,
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
          minItems: totalQuestions,
          maxItems: totalQuestions,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              question: {
                type: "string"
              },
              options: {
                type: "array",
                minItems: 0,
                maxItems: 4,
                items: {
                  type: "string"
                }
              },
              answer: {
                type: "string"
              },
              answerLetter: {
                type: "string",
                enum: ["A", "B", "C", "D", ""]
              },
              explanation: {
                type: "string"
              },
              questionType: {
                type: "string",
                enum: types
              },
              marks: {
                type: "integer",
                minimum: 0,
                maximum: 5
              },
              section: {
                type: "string"
              }
            },
            required: [
              "question",
              "options",
              "answer",
              "answerLetter",
              "explanation",
              "questionType",
              "marks",
              "section"
            ]
          }
        }
      },
      required: ["questions"]
    };

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
          instructions:
            "Return only valid JSON matching the supplied schema.",
          input: [
            {
              role: "user",
              content
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "asthira_question_paper",
              strict: true,
              schema
            }
          },
          max_output_tokens: Math.min(
            50000,
            Math.max(8000, totalQuestions * 600)
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

    let outputText = "";

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (
          item.type === "message" &&
          Array.isArray(item.content)
        ) {
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
        error: "AI returned no output."
      });
    }

    let result;

    try {
      result = JSON.parse(outputText);
    } catch {
      return res.status(500).json({
        error: "AI returned invalid JSON. Please generate again."
      });
    }

    if (
      !Array.isArray(result.questions) ||
      result.questions.length !== totalQuestions
    ) {
      return res.status(500).json({
        error:
          `AI returned ${result.questions?.length || 0} questions instead of ${totalQuestions}.`
      });
    }

    const actual = {};

    types.forEach(type => {
      actual[type] = 0;
    });

    for (const q of result.questions) {
      if (!types.includes(q.questionType)) {
        return res.status(500).json({
          error: "Invalid question type returned by AI."
        });
      }

      actual[q.questionType]++;

      if (!q.question || !q.answer || !q.explanation) {
        return res.status(500).json({
          error: "One or more questions are incomplete."
        });
      }

      if (
        [
          "MCQ",
          "Assertion–Reason",
          "Statement Based",
          "Case Based",
          "Previous Year Question"
        ].includes(q.questionType)
      ) {
        if (!Array.isArray(q.options) || q.options.length !== 4) {
          return res.status(500).json({
            error:
              `${q.questionType} question must contain four options.`
          });
        }
      }

      if (q.questionType === "1 Mark Questions" && q.marks !== 1) {
        return res.status(500).json({
          error: "Incorrect mark value for 1 mark question."
        });
      }

      if (q.questionType === "2 Mark Questions" && q.marks !== 2) {
        return res.status(500).json({
          error: "Incorrect mark value for 2 mark question."
        });
      }

      if (q.questionType === "3 Mark Questions" && q.marks !== 3) {
        return res.status(500).json({
          error: "Incorrect mark value for 3 mark question."
        });
      }

      if (q.questionType === "4 Mark Questions" && q.marks !== 4) {
        return res.status(500).json({
          error: "Incorrect mark value for 4 mark question."
        });
      }

      if (q.questionType === "5 Mark Questions" && q.marks !== 5) {
        return res.status(500).json({
          error: "Incorrect mark value for 5 mark question."
        });
      }
    }

    for (const type of types) {
      if (actual[type] !== cleanCounts[type]) {
        return res.status(500).json({
          error:
            `${type}: requested ${cleanCounts[type]}, generated ${actual[type]}. Please generate again.`
        });
      }
    }

    return res.status(200).json({
      questions: result.questions,
      totalQuestions,
      totalMarks,
      distribution: cleanCounts
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        error?.message ||
        "Server error"
    });
  }
}
