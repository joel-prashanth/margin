// Margin grading Worker. The extension calls these routes and expects
// { success: true, data } on success or { success: false, message } on failure.
// The grading logic is being moved over from the previous Worker; until then
// each grading route answers 501.

const GRADING_ROUTES = new Set(["/grade-journal", "/grade-reflective-essay", "/grade-lab"]);

// Open to any origin for now; restricting callers is the "protect the worker" task.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET" && pathname === "/health") {
      return json({ status: "ok" });
    }

    if (request.method === "POST" && GRADING_ROUTES.has(pathname)) {
      return json({ success: false, message: `${pathname} is not available yet.` }, 501);
    }

    return json({ success: false, message: "Not found." }, 404);
  },
};
