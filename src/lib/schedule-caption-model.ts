type Chat = (body: Record<string, unknown>) => Promise<{ choices?: { message?: { content?: string } }[] }>;

/** Prefer the requested high-reasoning writer; preserve availability if the account lacks model access. */
export async function writeScheduleCaptions(chat: Chat, body: Record<string, unknown>) {
  try {
    return { response: await chat({ ...body, model: "gpt-6-astra", reasoning_effort: "high" }), fallback: false };
  } catch (error) {
    if (!(error instanceof Error) || !/^AI gateway: (403|404)$/.test(error.message)) throw error;
    return { response: await chat({ ...body, model: "gpt-5.4-mini" }), fallback: true };
  }
}
