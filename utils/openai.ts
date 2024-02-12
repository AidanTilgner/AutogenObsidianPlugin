import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions";

export const getClient = (apiKey: string) => {
	return new OpenAI({
		apiKey,
		dangerouslyAllowBrowser: true,
	});
};

export const getGeneration = async ({
	client,
	model,
	systemPrompt,
	textWindow,
	match,
}: {
	client: OpenAI;
	model: ChatCompletionCreateParamsBase["model"];
	systemPrompt: string;
	textWindow: string;
	match: string;
}) => {
	try {
		const response = await client.chat.completions.create({
			model,
			messages: [
				{
					content: systemPrompt,
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
							"Provide the replacement text for the selection",
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
