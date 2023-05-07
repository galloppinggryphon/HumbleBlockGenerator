declare namespace Presets {
	interface PresetHandlerData {
		params: Partial<PresetTemplate.TemplateData>;
		presetName: string;
		/** Configuration data from block template */
		presetConfig: Partial<PresetTemplate.TemplateData>;
		presetVars: JSO;
		customVars: JSO;
		actionHooks: JSO;
		presetTemplate: Partial<PresetTemplate.TemplateData>;
	}

	interface PresetHandler {
		readonly data: Presets.PresetHandlerData;
		readonly name: string;
		readonly params: Partial<PresetTemplate.TemplateData>;
		readonly vars: JSO;
		readonly presetVars: JSO;
		readonly customVars: JSO;
		readonly presetPropertyVars: {};

		getParamByPath(...path: string[]): any;
		applyActionHook<Params>(hook: string, params: Params): void;
		clone(): Presets.PresetHandler;
		setCustomVar(key: string, value: string | number | any[] | JSO): void;
		setActionHook(hookName: string, func: Function): void;
		createPermutation(
			permutation: PresetTemplate.PermutationTemplate
		): void;
		createPartVisibilityRule(
			materialInstanceName: string,
			conditions: string[],
			property: string
		): void;

		createEvent({
			action,
			eventName,
			handler,
			params,
			condition,
		}: Presets.CreateEventProps): void;

		checkRequiredParams(): void;
	}

	/**
	 * Props for presetParser->createEvent().
	 */
	interface CreateEventProps extends Events.EventData {
		condition: string
	}

	interface TemplateParserArguments {
		block: CreateBlock.Block;
		presetHandler: PresetHandler;
		presetName: string;
	}

	type TemplateParsers = Record<
		"properties" | "events" | "permutation_data" | "boneVisibility" | "partVisibility",
		({
			block,
			presetHandler,
			presetName,
		}: TemplateParserArguments) => TemplateParserArguments
	>;
}
