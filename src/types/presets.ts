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
		// createPermutations(
		// 	permutations: PresetTemplate.McPermutationData | PresetTemplate.McPermutationData[]
		// ): void;
		createPermutation(
			permutation: PresetTemplate.PermutationItemData
		): void;
		createPartVisibilityRules(partVisibilityConfig: JSO): void;
		createPartVisibilityRule(
			materialInstanceName: string,
			conditions: string[],
			property: string
		): void;

		/* *
		 * Create events. Receives preset directives `@events`, `@event_handler_templates` and `@properties`.
		 */
		// createEvents({
		// 	events,
		// 	eventHandlers,
		// 	properties,
		// }: {
		// 	/** `@events`preset directive */
		// 	events: PresetTemplate.EventTriggers;
		// 	/** `@event_handler_templates` preset directive */
		// 	eventHandlers: PresetTemplate.EventHandlerTemplates;
		// 	/** `@properties` preset directive */
		// 	properties?: JSO;
		// }): void;

		createEvent({
			action,
			eventName,
			handler,
			params,
			// propertyNames,
			// triggerItems,
			triggerCondition,
		}: Presets.CreateEventProps): void;

		checkRequiredParams(): void;
	}

	/**
	 * Props for presetParser->createEvent().
	 */
	interface CreateEventProps extends Omit<Events.EventData, "condition"> {}

	interface TemplateParserArguments {
		block: CreateBlock.Block;
		presetHandler: PresetHandler;
		presetName: string;
	}

	type TemplateParsers = Record<
		"properties" | "events" | "permutations" | "partVisibility",
		({
			block,
			presetHandler,
			presetName,
		}: TemplateParserArguments) => TemplateParserArguments
	>;

	interface TemplateParsers2 {
		events({
			block,
			presetHandler,
			presetName,
		}: TemplateParserArguments): TemplateParserArguments;
	}
}
