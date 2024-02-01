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
}

const DEFAULT_SETTINGS: AutogenSettings = {
	openaiApiKey: "",
	model: "gpt-3.5-turbo",
};

export default class Autogen extends Plugin {
	settings: AutogenSettings;
	typingTimeout: NodeJS.Timeout | null = null;
	typingDelay = 2000;
	openaiClient: OpenAI | null = null;

	async onload() {
		await this.loadSettings();

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
		const pattern = /@\[(.*?)\]/g;
		const content = editor.getValue();
		const windowSize = 5000;

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

				const replacement = await this.generateReplacementText(
					textWindow,
					match[0]
				);
				modal.titleEl.setText("Replace selection with:");
				const textEl = createEl("p", {
					text: replacement,
				});
				modal.contentEl.appendChild(textEl);

				modal.contentEl.createEl("br");

				const confirmButton = createEl("button", { text: "Confirm" });
				confirmButton.setCssStyles({
					marginRight: "10px",
				});
				const cancelButton = createEl("button", { text: "Cancel" });

				confirmButton.addEventListener("click", () => {
					this.replaceText(editor, match[0], replacement);
					modal.close();
				});
				cancelButton.addEventListener("click", () => {
					modal.close();
				});

				modal.contentEl.appendChild(confirmButton);
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

		const textEl = createEl("p", {
			text: this.match.replace("@[", "").replace("]", ""),
		});
		contentEl.appendChild(textEl);

		contentEl.createEl("br");

		const confirmButton = createEl("button", { text: "Yes" });
		confirmButton.setCssStyles({
			marginRight: "10px",
		});
		const cancelButton = createEl("button", { text: "No" });

		confirmButton.addEventListener("click", async () => {
			contentEl.empty();
			this.onConfirm(this);
		});

		cancelButton.addEventListener("click", () => {
			this.close();
		});

		contentEl.appendChild(confirmButton);
		contentEl.appendChild(cancelButton);
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
	}
}
