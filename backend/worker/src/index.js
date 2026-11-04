export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // =====================================================
    // CORS PREFLIGHT
    // =====================================================

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);

    // =====================================================
    // ROUTE CHECK
    // =====================================================

    if (url.pathname !== "/grade-journal") {
      return Response.json(
        {
          success: false,
          message: "Not found.",
        },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    if (request.method !== "POST") {
      return Response.json(
        {
          success: false,
          message: "Use POST /grade-journal",
        },
        {
          status: 405,
          headers: corsHeaders,
        },
      );
    }

    try {
      // =====================================================
      // READ REQUEST
      // =====================================================

      const body = await request.json();

      const {
        experience = "",
        learning = "",
        application = "",
        feelings = "",
        conclusion = "",
      } = body ?? {};

      // =====================================================
      // BASIC INPUT VALIDATION
      // =====================================================

      const hasContent =
        String(experience).trim() ||
        String(learning).trim() ||
        String(application).trim() ||
        String(feelings).trim() ||
        String(conclusion).trim();

      if (!hasContent) {
        return Response.json(
          {
            success: false,
            message: "Journal content is empty.",
          },
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }

      // =====================================================
      // PROMPT
      // =====================================================

      const prompt = `
You are assisting a university faculty member with grading a Reflective Journal.

This is only an advisory grading recommendation.
The faculty member will review and edit every score and feedback before anything is saved to the university ERP.

Maximum marks: 20.

There are exactly five criteria.
Each criterion must receive an INTEGER score from 0 to 4.

CRITERIA

1. experience
2. learning
3. application
4. feelings
5. Conclusion

SCORING GUIDE

4 =
Specific, thoughtful, relevant, and demonstrates strong reflection,
understanding, or meaningful detail.

3 =
Good and relevant, but lacks some depth, specificity, reflection,
supporting explanation, or detail.

2 =
Partially relevant or mostly descriptive.
Shows limited reflection, explanation, understanding, or application.

1 =
Weak, generic, superficial, repetitive, or minimally connected
to the learning experience.

0 =
Missing, irrelevant, incoherent, or provides no meaningful evidence
for the criterion.

IMPORTANT GRADING RULES

- Grade only what the student actually wrote.
- Do not infer knowledge that is not demonstrated.
- Do not reward length by itself.
- Do not penalize minor grammar or spelling errors unless meaning is unclear.
- Do not automatically award 4 simply because a section is present.
- Distinguish description from genuine reflection.
- Experience should meaningfully describe the student's learning experience.
- Learning should identify meaningful knowledge, understanding, or insight gained.
- Application should explain how the learning can actually be used.
- Feelings should demonstrate reflection on confidence, difficulty, change,
  challenge, thinking, or the learning experience.
- Conclusion should synthesize learning and/or state meaningful next steps.
- Feedback must be concise, constructive, and professional.
- Address the student directly where appropriate.
- Do not mention AI in the feedback.
- Do not invent facts about the student.
- Do not include student name, email, registration number, or identifiers.

STUDENT JOURNAL

EXPERIENCE:

${String(experience).trim() || "No response provided."}

LEARNING:

${String(learning).trim() || "No response provided."}

APPLICATION:

${String(application).trim() || "No response provided."}

FEELINGS / REFLECTION:

${String(feelings).trim() || "No response provided."}

CONCLUSION:

${String(conclusion).trim() || "No response provided."}
`.trim();

      // =====================================================
      // JSON SCHEMA
      // =====================================================

      const responseFormat = {
        type: "json_schema",

        json_schema: {
          type: "object",

          additionalProperties: false,

          properties: {
            rubric: {
              type: "object",

              additionalProperties: false,

              properties: {
                experience: {
                  type: "integer",
                  minimum: 0,
                  maximum: 4,
                },

                learning: {
                  type: "integer",
                  minimum: 0,
                  maximum: 4,
                },

                application: {
                  type: "integer",
                  minimum: 0,
                  maximum: 4,
                },

                feelings: {
                  type: "integer",
                  minimum: 0,
                  maximum: 4,
                },

                Conclusion: {
                  type: "integer",
                  minimum: 0,
                  maximum: 4,
                },
              },

              required: [
                "experience",
                "learning",
                "application",
                "feelings",
                "Conclusion",
              ],
            },

            reasoning: {
              type: "object",

              additionalProperties: false,

              properties: {
                experience: {
                  type: "string",
                },

                learning: {
                  type: "string",
                },

                application: {
                  type: "string",
                },

                feelings: {
                  type: "string",
                },

                Conclusion: {
                  type: "string",
                },
              },

              required: [
                "experience",
                "learning",
                "application",
                "feelings",
                "Conclusion",
              ],
            },

            feedback: {
              type: "string",
            },

            flags: {
              type: "array",

              items: {
                type: "string",
              },
            },
          },

          required: [
            "rubric",
            "reasoning",
            "feedback",
            "flags",
          ],
        },
      };

      // =====================================================
      // WORKERS AI
      // =====================================================

      const result = await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct-fast",
        {
          messages: [
            {
              role: "system",
              content:
                "You are a careful academic grading assistant. Follow the supplied rubric exactly.",
            },

            {
              role: "user",
              content: prompt,
            },
          ],

          temperature: 0.2,

          max_tokens: 900,

          response_format: responseFormat,
        },
      );

      // =====================================================
      // READ MODEL RESULT
      // =====================================================

      let parsed;

      if (
        result &&
        typeof result.response === "object" &&
        result.response !== null
      ) {
        parsed = result.response;
      } else if (typeof result?.response === "string") {
        try {
          parsed = JSON.parse(result.response);
        } catch {
          console.error(
            "Raw Workers AI output:",
            result.response,
          );

          throw new Error(
            "AI returned invalid JSON.",
          );
        }
      } else {
        throw new Error(
          "Workers AI returned no grading result.",
        );
      }

      // =====================================================
      // VALIDATE RUBRIC
      // =====================================================

      const fields = [
        "experience",
        "learning",
        "application",
        "feelings",
        "Conclusion",
      ];

      const rubric = {};

      let total = 0;

      for (const field of fields) {
        const score = Number(
          parsed?.rubric?.[field],
        );

        if (
          !Number.isInteger(score) ||
          score < 0 ||
          score > 4
        ) {
          throw new Error(
            `Invalid rubric score for ${field}.`,
          );
        }

        rubric[field] = score;

        total += score;
      }

      // =====================================================
      // VALIDATE FEEDBACK
      // =====================================================

      const feedback = String(
        parsed?.feedback ?? "",
      ).trim();

      if (!feedback) {
        throw new Error(
          "AI returned empty feedback.",
        );
      }

      // =====================================================
      // NORMALIZE REASONING
      // =====================================================

      const reasoning = {
        experience: String(
          parsed?.reasoning?.experience ?? "",
        ).trim(),

        learning: String(
          parsed?.reasoning?.learning ?? "",
        ).trim(),

        application: String(
          parsed?.reasoning?.application ?? "",
        ).trim(),

        feelings: String(
          parsed?.reasoning?.feelings ?? "",
        ).trim(),

        Conclusion: String(
          parsed?.reasoning?.Conclusion ?? "",
        ).trim(),
      };

      // =====================================================
      // NORMALIZE FLAGS
      // =====================================================

      const flags = Array.isArray(parsed?.flags)
        ? parsed.flags
            .map((flag) =>
              String(flag).trim(),
            )
            .filter(Boolean)
        : [];

      // =====================================================
      // RETURN RESULT
      // =====================================================

      return Response.json(
        {
          success: true,

          data: {
            rubric,

            reasoning,

            feedback,

            flags,

            marks: total,

            maxMarks: 20,
          },
        },
        {
          headers: corsHeaders,
        },
      );
    } catch (error) {
      console.error(
        "Journal grading error:",
        error,
      );

      return Response.json(
        {
          success: false,

          message:
            error?.message ??
            "Unable to grade journal.",
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }
  },
};
