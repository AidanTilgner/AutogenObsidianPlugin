# Obsidian Autogen Plugin
The Autogen plugin allows you to create in-place generations within notes, using OpenAI's models.

# Settings
Define your API key in the plugin settings, as well as the model to use for text generation. The `gpt-3.5-turbo` plugin is the default, due to it's low cost and very fast completions. However for more accuracy at slightly slower inference speed I'd recommend GPT-4. 32k variants of each model are also available, and allow for much larger token sizes. To learn more about tokens and specifics I'd recommend reading [OpenAI's forum](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them) on the subject. You can also change the `Trigger Regex`, which will decide what text should be looked for and matched as a selection to be replaced.

You can also modify the `Window Size`, which is different but correlated with the token limit of the selected model. The `Window Size` setting defines how many characters, not including the trigger prompt (this: @[prompt is here]), should be sent to the model. This likely won't matter for most notes, however for longer notes it's important to make sure that too many tokens aren't being sent, as this may cause errors. This setting defaults to 8k which will send _about_ 2k tokens per generation, from above and below the text. This should be enough for basic context to be sent to the model, but can be increased to about 16k on the smaller models and about 128k on the larger ones.

> ![warning]
> The number of tokens sent to the server will influence the price that you will pay for API usage.

If you don't understand what these things mean, or you want to keep things simple, I'd recommend **sticking to the defaults**.


# Usage
When you're working in a note, you can use the following syntax (@[prompt]) to trigger a generation:

```markdown
There are many classes that can be taken at Lorem Ipsum University, for example:

@[a table with 3 columns: id, name, description and 3 rows with dummy entries for a list of classes one could take]
```

Then, whatever is in this selection, as well as a window of context from your note (capped at 8000 characters by default to limit token usage), will be sent to the language model of choice after a typing delay. The subsequent generation will replace your content, for example the above would be replaced by:

```markdown
There are many classes that can be taken at Lorem Ipsum University, for example:

| ID | Class Name | Class Description |
| ---- | ---- | ---- |
| 1 | Mathematics | This course covers foundational aspects of math |
| 2 | English Literature | Learn in-depth analysis of English literary works |
| 3 | Computer Science | Basic principles of computing and programming languages covered |
```

The main thing that is happening here is that the @[prompt] syntax is being used to trigger a replacement.

# Timeline
Additional features may be added if requested, but the idea is to keep the functionality relatively simple.

# Bugs, Questions, Etc.
If you have any questions or notice any unexpected behavior feel free to open an issue and I will try to reponse ASAP.