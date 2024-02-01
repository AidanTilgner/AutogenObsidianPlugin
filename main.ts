import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import OpenAI from "openai";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions";
import { getClient, getReplacement } from "utils/openai";

interface AutogenSettings {
	openaiApiKey: string;
	model: ChatCompletionCreateParamsBase["model"];
	triggerRegex: string;
	windowSize: number;
	typingDelay: number;
}

const DEFAULT_SETTINGS: AutogenSettings = {
	openaiApiKey: "",
	model: "gpt-3.5-turbo",
	triggerRegex: "@\\[(.*?)\\]",
	windowSize: 8000,
	typingDelay: 2000,
};

export default class Autogen extends Plugin {
	settings: AutogenSettings;
	typingTimeout: NodeJS.Timeout | null = null;
	typingDelay = 2000;
	openaiClient: OpenAI | null = null;

	async onload() {
		await this.loadSettings();
		this.typingDelay = this.settings.typingDelay;

		this.registerEvent(
			this.app.workspace.on(
				"editor-change",
				this.handleEditorChange.bind(this)
			)
		);

		this.addSettingTab(new AutogenSettingTab(this.app, this));

		this.initOpenAIClient();
	}

	initOpenAIClient() {
		if (this.settings.openaiApiKey) {
			this.openaiClient = getClient(this.settings.openaiApiKey);
		}
	}

	async handleEditorChange(editor: Editor, view: MarkdownView) {
		if (this.typingTimeout !== null) {
			clearTimeout(this.typingTimeout);
		}
		this.typingTimeout = setTimeout(
			() => this.showConfirmationModal(editor),
			this.typingDelay
		);
	}

	async showConfirmationModal(editor: Editor) {
		const pattern = new RegExp(this.settings.triggerRegex, "g");
		const content = editor.getValue();
		const windowSize = this.settings.windowSize;

		const match = pattern.exec(content);

		if (match !== null) {
			const start = Math.max(match.index - windowSize / 2, 0);
			const end = Math.min(
				match.index + match[0].length + windowSize / 2,
				content.length
			);

			const textWindow = content.substring(start, end);

			const onConfirm = async (modal: Modal) => {
				modal.contentEl.empty();
				modal.titleEl.setText("Generating replacement...");

				// put a little loading indicator in the contentEl
				const loadingEl = createEl("p", {
					text: "Loading...",
				});
				modal.contentEl.appendChild(loadingEl);

				const replacement = await this.generateReplacementText(
					textWindow,
					match[0]
				);
				modal.contentEl.empty();
				modal.titleEl.setText("Replace selection with:");
				const textEl = createEl("p", {
					text: replacement,
				});
				modal.contentEl.appendChild(textEl);

				modal.contentEl.createEl("br");

				const buttonContainer = createEl("div");
				buttonContainer.style.display = "flex";
				buttonContainer.style.justifyContent = "flex-end";
				buttonContainer.style.alignItems = "center";
				buttonContainer.style.width = "100%";
				buttonContainer.style.gap = "10px";

				const confirmButton = createEl("button", { text: "Confirm" });
				const cancelButton = createEl("button", { text: "Cancel" });

				confirmButton.addEventListener("click", () => {
					this.replaceText(editor, match[0], replacement);
					modal.close();
				});
				cancelButton.addEventListener("click", () => {
					modal.close();
				});

				buttonContainer.appendChild(cancelButton);
				buttonContainer.appendChild(confirmButton);

				modal.contentEl.appendChild(buttonContainer);
			};

			const modal = new AutogenConfirmationModal(
				this.app,
				match[0],
				onConfirm
			);
			modal.open();
		}
	}

	async generateReplacementText(window: string, match: string) {
		if (this.openaiClient === null) {
			this.initOpenAIClient();
		}

		if (this.openaiClient !== null) {
			const replacement = await getReplacement(
				this.openaiClient,
				this.settings.model,
				window,
				match
			);
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

class AutogenConfirmationModal extends Modal {
	public match = "";
	public onConfirm: (modal: Modal) => void;

	constructor(app: App, match: string, onConfirm: (modal: Modal) => void) {
		super(app);
		this.match = match;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		titleEl.setText("Replace this selection?");

		contentEl.style.whiteSpace = "pre-wrap";

		const textEl = createEl("p", {
			text: `"${this.match.replace("@[", "").replace("]", "")}"`,
		});
		contentEl.appendChild(textEl);

		contentEl.createEl("br");

		const buttonContainer = createEl("div");
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.alignItems = "center";
		buttonContainer.style.width = "100%";
		buttonContainer.style.gap = "10px";

		const confirmButton = createEl("button", { text: "Yes" });
		const cancelButton = createEl("button", { text: "No" });

		confirmButton.addEventListener("click", async () => {
			contentEl.empty();
			this.onConfirm(this);
		});

		cancelButton.addEventListener("click", () => {
			this.close();
		});

		buttonContainer.appendChild(cancelButton);
		buttonContainer.appendChild(confirmButton);

		contentEl.appendChild(buttonContainer);
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

		new Setting(containerEl)
			.setName("OpenAI API Key")
			.setDesc(
				"Your OpenAI API Key (find or create one at https://platform.openai.com/api-keys)"
			)
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
			.setName("Trigger Regex")
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
			.setName("Window Size")
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
			.setName("Typing Delay")
			.setDesc(
				"The delay in milliseconds to wait after the user stops typing before generating the replacement"
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter the typing delay")
					.setValue(this.plugin.settings.typingDelay.toString())
					.onChange(async (value) => {
						this.plugin.settings.typingDelay = parseInt(value);
						await this.plugin.saveSettings();
					})
			);
	}
}
