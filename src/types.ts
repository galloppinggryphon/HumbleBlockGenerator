type JSO<T extends any = any> = Record<string, T>;

type CombineTwo<A, B> = A & B;

type Coordinates = [x: number, y: number, z: number];

/**
 * e: east, w: west, n: north, s: south, t: top, bottom: bottom
 */
type UnitCubeTransformAnchors =
	| "wbs"
	| "wbn"
	| "wts"
	| "wtn"
	| "ebs"
	| "ebn"
	| "etn"
	| "ets";

interface Props {
	[x: string]: any;
	components?: JSO;
	description?: JSO;
	events?: JSO;
	permutations?: JSO[];
}

type PropsProxy<Props> = Props & {
	filterEmpty(): Props;
	export(): Props;
};

declare namespace Events {
	// interface EventsDirectiveItem extends Pick<EventData, "condition"|"handler"|"target"|"action"|"eventTrigger"> {}

	interface EventData {
		/**
		 * Event handler actions
		 *
		 * @see Valid event types: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockevents/blockeventlist
		 */
		action?: Events.ActionItem[]; // | Events.ActionSequence;
		/** Action execution filter (Molang expression) */
		condition?: string;
		/**
		 * Minecraft event trigger.
		 *
		 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blocktriggers/blocktriggerlist
		 */
		eventName?: string;
		/** Name of event handler */
		handler?: string;
		/** Properties, variables to use with event_handler_templates  */
		// event_handler_params?: JSO;
		eventHandlerParams?: JSO;

		params?: JSO;
		/** List of properties to use with event */
		// propertyNames?: string | string[];
		/** Event target, e.g. `self` or `player` */
		target?: string;
		/** Condition to use with event trigger */
		triggerCondition?: string;
		/** Items that can trigger this event {Key: ItemName} */
		// triggerItems?: JSO<string>;
	}

	/** Event handler item used in preset event_handler_templates key */
	interface EventHandlerItemTemplate
		extends Pick<Events.EventData, "action" | "triggerCondition"> {}

	/** Event trigger item used in preset events key: condition, handler, target, propertyNames, triggerItems */
	interface EventTriggerItemTemplate
		extends Pick<
			Events.EventData,
			| "action"
			| "condition"
			| "handler"
			// | "propertyNames"
			// | "triggerItems"
			| "target"
		> {}

	/** Event trigger data used in block component */
	interface EventTriggerComponent
		extends Pick<Events.EventData, "condition" | "handler" | "target"> {}

	/** Used by block templates */
	interface EventDirectiveItem
		extends CombineTwo<
			EventHandlerItemTemplate,
			Pick<
				Events.EventData,
				"handler" | "target" | "action"
			>
		> {}

	/** Used by block templates */
	interface EventDirectives {
		[eventHandlerName: string]: EventDirectiveItem | Events.ActionItem[];
	}

	type ActionSequence = {
		sequence: Events.ActionItem[];
	};

	type ActionItem = {
		forEach?: string;
		for_each?: string;
		params?: JSO;
	} & {
		[action: string]: string;
		condition?: string;
	};
}

declare namespace CreateBlock {
	interface Block {
		readonly data: CreateBlock.Data;
		readonly permutationInfo: PermutationTreeData;
		addEvent(eventTemplate: Events.EventData): void;
		addMinecraftPermutation(condition: string, props: JSO): void;
		addMaterialInstances(newInstances: any): void;
		addPartVisibility(
			materialInstanceName: string,
			conditions: string[]
		): void;
		addProperty(key: string, values: any): void;
		make(): GeneratedBlockData;
	}

	interface Data {
		blockInfo: BlockInfo;
		source: BlockTemplateData;
		extraVars: ExtraVars;
		props: JSO;
		permutations: MinecraftPermutationStore;
		eventTriggers: JSO<Events.EventTriggerComponent>;
		eventHandlers: JSO<Events.ActionSequence>;
	}

	type BlockInfo = {
		key: string;
		name: string;
		fullName: string;
		finalPermutation: string;
	};

	type MinecraftPermutationStore = {
		[condition: string]: any;
	};
}

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

interface GeneratedBlockData {
	source: BlockTemplateData;
	block: JSO; // Props( data.props ),
	identifier: string;
	title: string;
	permutationData: {
		data: PermutationInfo[];
		path: string[];
	};
}

interface BlockTemplateData {
	dir?: JSO;
	props: PropsProxy<Props>;
	static?: JSO;
	tags?: JSO;
	templateStrings?: JSO;
	variants?: JSO;
	vars?: JSO;
}

interface PropParsers {
	[propName: string]: (block: CreateBlock.Block) => CreateBlock.Block;
}

interface PermutationTreeData {
	readonly data: PermutationInfo[];
	readonly path: string[];
	getFinalPermution(includeMaterialPermutations?: boolean): string;
}

interface PermutationInfo {
	key: string;
	title?: string;
	type?: "material" | "default";
}

/**
 * Block parser data.
 */
interface PermutationData {
	/**
	 * Template data (parsed input)
	 */
	block: BlockTemplateData;

	/**
	 * ?? All permutations created so far??
	 */
	permutationInfo: PermutationInfo[];

	/**
	 * Materials to use for this permutation tree.
	 */
	materialPermutations: PermutationBuilder[];

	/**
	 * Data about the current permutation in the loop.
	 */
	currentPermutation: {
		isValid: boolean;
		key: string;
		name: string;
		fullName: string;
	};
}

/**
 * Block parser methods.
 */
interface PermutationBuilderHandlers {
	readonly permutations: PermutationTreeData;

	/**
	 * Reference to the proxy MaterialBuilder
	 */
	materials: MaterialBuilder;

	mergeProps(obj: JSO): void;
	isValid(): boolean;
	setPermutationData({ key, title, type }: PermutationInfo): void;
	hasPermutations(): boolean;
	getPermutations(): [string, JSO][];
	newPermutation(
		permutationKey: string,
		blockTemplate: JSO
	): PermutationBuilder;
	createBlock(): GeneratedBlockData;
	newMaterialPermutation(
		name: string,
		materials: BlockTemplateData
	): PermutationBuilder;
	disablePermutation(): void;
	mergeTemplateData(templateData: BlockTemplateData): void;
	mergePresetSettings(dir: JSO): void;
	eachMaterialPermutation(): PermutationBuilder[];
	parseMaterials(): void;
}

/**
 * Block parser public proxy data and methods.
 */
interface PermutationBuilderPublicProxyInterface {
	export(): PermutationBuilder;
	copyPermutationData(): PermutationBuilder;
	data: PermutationData;
	children: JSO;
}

/**
 * Block parser.
 */
type PermutationBuilder = PermutationBuilderPublicProxyInterface &
	PermutationBuilderHandlers;

interface PermutationBuilderProxy
	extends PermutationBuilderPublicProxyInterface {
	/**
	 * Permutation methods
	 */
	handlers: PermutationBuilderHandlers;

	/**
	 * MaterialBuilder factory
	 */
	materials: MaterialBuilder;
}

// interface CreateBlock.Block {
// 	readonly data: CreateBlockData;
// 	readonly permutationInfo: PermutationInfoHandler;
// 	addEvent( eventTemplate: EventTemplate ): void;
// 	addMinecraftPermutation( condition: string, props: JSO ): void;
// 	addMaterialInstances( newInstances: any ): void;
// 	addPartVisibility( materialInstanceName: string, conditions: string[] ): void;
// 	addProperty( key: string, values: any ): void;
// 	make(): GeneratedBlockData;
// }

type MaterialInstance = {
	texture: string;
	render_method?: string;
	ambient_occlusion?: boolean;
	face_dimming?: boolean;
};

type MaterialInstanceCollection = {
	[materialInstanceKey: string]: MaterialInstance;
};

type MaterialTemplate = {
	title?: string;
	texture?: string;
	render_method?: string;
	ambient_occlusion?: boolean;
	face_dimming?: boolean;
};

type MaterialTemplates = {
	[materialKey: string]: MaterialTemplate;
};

type MaterialPermutationCollection = {
	[permutationKey: string]: MaterialInstanceCollection;
};

type MaterialPermutationStore = {
	[permutationKey: string]: MaterialStoreItem;
};

type MaterialStoreItem = {
	title: string;
	materialInstances: MaterialInstanceCollection;
};

type MaterialFilter = string[];
type MaterialInstanceFilter = string[];

interface MaterialBuilderData {
	render: {};
	/**
	 * Base data.
	 */
	materialTemplates: MaterialTemplates;

	/**
	 * Exports.
	 */
	materials: MaterialPermutationStore;

	/**
	 * Temp data.
	 */
	materialPermutations: MaterialPermutationStore;
}

/**
 * Material builder factory.
 */
type MaterialBuilder = {
	data: MaterialBuilderData;
	/**
	 * Parse template data and extract materials.
	 */
	extractMaterials(templateData: BlockTemplateData): void;
	generatePermutations(): void;
};

interface ExtraVars {
	prefix: string;
	permutation: string;
	variant: string;
	material: string;
	blockName: string;
}

type MagicExpressionMatch = {
	divider: string;
	dynamic_key: string;
	expression: string;
	preset_property: string;
	sub_key: string;
};

interface MagicExpressionMeta<IsMagicExpression extends boolean = true> {
	isMagicExpression: IsMagicExpression;
	property: string;
	path: string[];
	dynamicProperty: any;
	magicExpression: string;
	operation: string;
	metaKey: string;
	variable: string;
}

type MagicExpressionKeyData = {
	key: string;
	magic_key: string;
	name: string;
	current_block_state: string;
};

interface MagicExpressionData extends MagicExpressionKeyData {
	[propertyName: string]: any;
	current_value?: string | number;
	keys?: string[];
	key_list?: string;
	is_main_hand?: string;
	length?: number;
	max?: number;
	min?: number;
	// combine?: string;
	value?: string | string[] | number | number[];
	value_list?: string;
}

type LogItem = {
	level: number;
	levelStr: string;
	context: string;
	label: string;
	msg: string;
	line?: string;
	file?: string;
	column?: string;
	stacktrace?: string;
	additionalData: string;
};
