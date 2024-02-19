import {
	App,
	Editor,
	Modal,
	Plugin,
	PluginSettingTab,
	Setting,
	EditorSuggest,
	EditorPosition,
	EditorSuggestTriggerInfo,
	TFile,
	EditorSuggestContext,
} from "obsidian";
import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions";
import { getClient, getGeneration } from "utils/openai";

interface AutogenSettings {
	openaiApiKey: string;
	customURL?: string;
	model: ChatCompletionCreateParamsBase["model"];
	triggerRegex: string;
	windowSize: number;
	systemPrompt: string;
}

const DEFAULT_SETTINGS: AutogenSettings = {
	openaiApiKey: "",
	customURL,
	model: "gpt-3.5-turbo",
	triggerRegex: "@\\[(.*?)\\]",
	windowSize: 8000,
	systemPrompt: `# Identity:
You are a helpful content generator. Given a selection of text, you are tasked with generating a replacement for the selection.

# Your Role
Based on the context of the full text, and the selection itself, you are to generate a replacement for the given selection.
The selection might take the form of an instruction, something to elaborate on, a transformation of some other part of the text, or some other prompt.
The goal is to provide the best completion for the given selection, based on the context of the full text and the intent of the author.

# Things to remember:
- Markdown is supported
- This is an Obsidian plugin, so you can use Obsidian-specific syntax
	`,
};

export default class Autogen extends Plugin {
	settings: AutogenSettings;
	openaiClient: OpenAI | null = null;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new AutogenSettingTab(this.app, this));

		this.initOpenAIClient();

		// add the suggester
		this.registerEditorSuggest(new AutogenSuggest(this));
	}

	initOpenAIClient() {
		if (this.settings.openaiApiKey) {
			if (this.settings.customURL) {
				this.openaiClient = getClient(this.settings.openaiApiKey, this.settings.customURL);
			} else {
				this.openaiClient = getClient(this.settings.openaiApiKey);
			}
		}
	}

	matchRegex(editor: Editor) {
		const cursor = editor.getCursor();
		const content = editor.getLine(cursor.line);

		const match = content.match(this.settings.triggerRegex);

		return match;
	}

	async triggerGeneration(editor: Editor) {
		const pattern = new RegExp(this.settings.triggerRegex, "g");
		const content = editor.getValue();

		const match = pattern.exec(content);

		const windowSize = this.settings.windowSize;
		if (match !== null) {
			const start = Math.max(match.index - windowSize / 2, 0);
			const end = Math.min(
				match.index + match[0].length + windowSize / 2,
				content.length
			);

			const textWindow = content.substring(start, end);

			const modal = new AutogenModal(this, match[0], textWindow, editor);
			modal.open();
		}
	}

	async generateReplacementText(window: string, match: string) {
		if (this.openaiClient === null) {
			this.initOpenAIClient();
		}

		if (this.openaiClient !== null) {
			const replacement = await getGeneration({
				client: this.openaiClient,
				model: this.settings.model,
				systemPrompt: this.settings.systemPrompt,
				textWindow: window,
				match,
			});
			if (replacement) {
				return replacement;
			} else {
				console.error("Error generating replacement text");
				return "Error: Error generating replacement text";
			}
		} else {
			console.error("OpenAI client not initialized");
			return "Error: OpenAI client not initialized. Please make sure there is an API key set in the settings.";
		}
	}

	replaceText(editor: Editor, match: string, replacement: string) {
		const content = editor.getValue();
		const newContent = content.replace(match, replacement);
		editor.setValue(newContent);

		// find the line number of the replacement string
		const matchIndex = newContent.indexOf(replacement);
		const lineNumber = newContent.substr(0, matchIndex).split("\n").length;

		// find the character position of the replacement string
		const line = editor.getLine(lineNumber);
		const charPosition = line.indexOf(replacement);

		editor.setCursor({
			line: lineNumber,
			ch: charPosition,
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

interface Suggestion {
	label: string;
	id: string;
}

class AutogenSuggest extends EditorSuggest<Suggestion> {
	private editor: Editor;

	constructor(public plugin: Autogen) {
		super(plugin.app);

		this.setInstructions([
			{
				command: "Press Enter",
				purpose: "to create generation",
			},
		]);
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile | null
	): EditorSuggestTriggerInfo | null {
		if (this.plugin.matchRegex(editor) == null) {
			return null;
		}

		this.editor = editor;

		return {
			start: cursor,
			end: cursor,
			query: "",
		};
	}

	getSuggestions(
		context: EditorSuggestContext
	): Suggestion[] | Promise<Suggestion[]> {
		return [
			{
				label: "Get suggestions",
				id: "getSuggestions",
			},
		];
	}

	selectSuggestion(value: Suggestion, evt: MouseEvent | KeyboardEvent): void {
		switch (value.id) {
			case "getSuggestions":
				this.plugin.triggerGeneration(this.editor);
				break;
			default:
				break;
		}
	}

	renderSuggestion(value: Suggestion, el: HTMLElement): void {
		el.setText(value.label);
	}
}

class AutogenModal extends Modal {
	public match = "";
	public plugin: Autogen;
	public textWindow = "";
	public editor: Editor;

	constructor(
		plugin: Autogen,
		match: string,
		textWindow: string,
		editor: Editor
	) {
		super(plugin.app);
		this.match = match;
		this.plugin = plugin;
		this.textWindow = textWindow;
		this.editor = editor;
	}

	async onOpen() {
		const { contentEl, titleEl } = this;

		contentEl.empty();
		titleEl.setText("Generating replacement...");

		const loadingEl = createEl("p", {
			text: "Loading...",
		});
		contentEl.appendChild(loadingEl);

		const replacement = await this.plugin.generateReplacementText(
			this.textWindow,
			this.match
		);

		contentEl.empty();
		titleEl.setText("Replace selection with:");
		const textEl = createEl("p", {
			text: replacement,
		});
		contentEl.appendChild(textEl);

		contentEl.createEl("br");

		const buttonContainer = createEl("div");
		buttonContainer.addClass("autogen-modal-button-container");

		const confirmButton = createEl("button", { text: "Confirm" });
		const cancelButton = createEl("button", { text: "Cancel" });

		confirmButton.addEventListener("click", () => {
			this.plugin.replaceText(this.editor, this.match, replacement);
			this.close();
		});
		cancelButton.addEventListener("click", () => {
			this.close();
		});

		buttonContainer.appendChild(cancelButton);
		buttonContainer.appendChild(confirmButton);

		this.contentEl.appendChild(buttonContainer);

		confirmButton.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class AutogenSettingTab extends PluginSettingTab {
	plugin: Autogen;

	constructor(app: App, plugin: Autogen) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const apiKeyDesc = document.createDocumentFragment();

		// Create a span element to hold the text
		const span = document.createElement("span");
		span.textContent = "Your OpenAI API Key (find or create one ";

		// Create the anchor element for the link
		const link = document.createElement("a");
		link.href = "https://platform.openai.com/api-keys";
		link.textContent = "here";
		link.target = "_blank"; // Optional: Opens the link in a new tab

		// Append the text and link to the DocumentFragment
		apiKeyDesc.appendChild(span);
		apiKeyDesc.appendChild(link);
		apiKeyDesc.appendChild(document.createTextNode(")")); // To add the closing parenthesis

		new Setting(containerEl)
			.setName("OpenAI API key")
			.setDesc(apiKeyDesc)
			.addText((text) =>
				text
					.setPlaceholder("Enter your API Key")
					.setValue(this.plugin.settings.openaiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openaiApiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Custom URL")
			.setDesc("Set a custom URL (e.g. for proxy or local models with OpenAI-compatible API)")
			.addText((text) =>
				text
					.setPlaceholder("Custom URL (leave blank for OpenAI default)")
					.setValue(this.plugin.settings.customURL)
					.onChange(async (value) => {
						this.plugin.settings.customURL = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Model")
			.setDesc("The model to use for generating text")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("gpt-3.5-turbo", "GPT-3.5 Turbo")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					});

				dropdown
					.addOption("gpt-3.5-turbo-16k", "GPT-3.5 Turbo 16k")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					});

				dropdown
					.addOption("gpt-4", "GPT-4")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					});

				dropdown
					.addOption("gpt-4-32k", "GPT-4 32k")
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Trigger regex")
			.setDesc("The regex pattern to trigger the autogen")
			.addText((text) =>
				text
					.setPlaceholder("Enter the regex pattern")
					.setValue("@\\[(.*?)\\]")
					.onChange(async (value) => {
						this.plugin.settings.triggerRegex = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Window size")
			.setDesc(
				"The max number of characters, not including the prompt, to be sent for the generation. This affects token usage and performance."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter the window size")
					.setValue(this.plugin.settings.windowSize.toString())
					.onChange(async (value) => {
						this.plugin.settings.windowSize = parseInt(value);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("System prompt")
			.setDesc("The prompt to send to the OpenAI API")
			.addTextArea((text) => {
				text.setPlaceholder("Enter the system prompt")
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					});

				text.inputEl.addClass("autogen-systemprompt-textarea");
			});
	}
}
