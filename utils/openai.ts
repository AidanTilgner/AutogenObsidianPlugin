import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions";

export const getClient = (apiKey: string) => {
	console.log("Dangerously allowing browser");
	return new OpenAI({
		apiKey,
		dangerouslyAllowBrowser: true,
	});
};

export const getReplacement = async (
	client: OpenAI,
	model: ChatCompletionCreateParamsBase["model"],
	textWindow: string,
	match: string
) => {
	try {
		const response = await client.chat.completions.create({
			model,
			messages: [
				{
					content: `
					Identity:
					You are a helpful text replacer. Given a selection of text, you are tasked with generating a replacement for the selection.

					# Context
					The selection will be shown in the following format:
					@[selection]

					# Your Role
					Its your job to generate what should go there in replacement, based on the user's prompt. Depending on the context, the replacement
					may be a placeholder to be expanded on, or instructions for a more in-depth replacement. Generate the replacement which makes the most sense
					based on a combination of the context and the selection itself.

					# Things to remember:
					- Markdown is preferred
					- Keep in mind the context of the full text given, but only replace the selection itself
						`,
					role: "system",
				},
				{
					content: `
						Full Text:
						${textWindow}

						Specific Selection to Replace:
						${match}
						`,
					role: "user",
				},
			],
			tools: [
				{
					type: "function",
					function: {
						name: "replace_text",
						description:
							"Replace the selection based on its content",
						parameters: {
							type: "object",
							properties: {
								selectionReplacement: {
									type: "string",
									description:
										"The text that will replace the selection",
								},
							},
						},
					},
				},
			],
			tool_choice: {
				type: "function",
				function: {
					name: "replace_text",
				},
			},
		});
		if (response.choices.length === 0) {
			return "Error: No response from OpenAI";
		}
		const call = response.choices[0].message.tool_calls?.[0].function;
		if (call === undefined) {
			return "Error: Invalid response from OpenAI";
		}
		const replacement = JSON.parse(call.arguments).selectionReplacement;
		if (replacement === undefined) {
			return "Error: Invalid response from OpenAI";
		}
		return replacement;
	} catch (e) {
		console.error(e);
		return undefined;
	}
};
