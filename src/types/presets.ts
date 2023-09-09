declare namespace Presets {
	interface PresetHandlerData {
		alias?: string,
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

		prepareBoneVisibilityRules(): void

		createEvent( eventName: string, event: Events.EventTrigger, action: Presets.ComponentData[] ): void;

		prepareEvents(): void

		checkRequiredParams(): void;
	}

	type ComponentData = {
		forEach?: string;
		for_each?: string;
		params?: JSO;
		template?: ComponentDataTemplate
	};

	type ComponentDataTemplate = {
		[action: string]: string;
		condition?: string;
	}

	namespace ComponentGenerator {
		type GeneratorData = {
			accumulateKeys: string[],
			forEachData: JSO,
			forEachKeys: number[],
			forEachMeta: JSO,
			forEachValues: any[],
			magicExpressions: string[],
			params: JSO,
			paramsComplete: boolean,
			template: ComponentDataTemplate,
		}

		type ForEachMeta = {
			property: string,
			prop_key: string,
			key: number,
			first_key: number,
			last_key: number,
			next_key: number,
			index: number,
			next_index: number,
			counter: number,
			next_counter: number
			count: number,
			max: number,
			min: number,
			value: number|string,
			next_value: number|string,
			first_value: number|string,
			last_value: number|string,
		}

		type CurrentElement = {
			forEachCurrent: ForEachMeta,
			forEachData: JSO,
			dynamicVars: JSO,
			meta: JSO
		}
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

	type PresetParsers = Record<
		"states" | "events" | "permutations" | "boneVisibility",
		({
			block,
			presetHandler,
			presetName,
		}: TemplateParserArguments) => TemplateParserArguments
	>;
}
