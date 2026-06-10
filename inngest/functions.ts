import { inngest } from "./client";

export const helloKayna = inngest.createFunction(
  {
    id: "hello-kayna",
    triggers: [{ event: "kayna/hello" }],
  },
  async ({ event, step }) => {
    const data = event.data as { leadId?: string };

    await step.run("log-hello", async () => {
      console.log("Hello from Kayna!", data.leadId ?? "(no leadId)");
    });

    await step.sleep("brief-pause", "1s");

    return { message: `Hello from Kayna! leadId=${data.leadId ?? "none"}` };
  }
);
