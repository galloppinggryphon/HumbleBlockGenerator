type JSO<T extends any = any> = Record<string, T>;

type Coordinates = [x: number, y: number, z: number]

/**
 * e: east, w: west, n: north, s: south, t: top, bottom: bottom
 */
type UnitCubeTransformAnchors = 'wbs' | 'wbn' | 'wts' | 'wtn' | 'ebs' | 'ebn' | 'etn' | 'ets'

interface Props {
	[x: string]: any;
	components?: JSO;
	description?: JSO;
	events?: JSO;
	permutations?: JSO[];
}

type PropsProxy<Props> = Props & {
	filterEmpty(): Props,
	export(): Props
}

declare namespace CreateBlock {
	interface Block {
		readonly data: CreateBlock.Data;
		readonly permutationInfo: PermutationInfoHandler;
		addEvent( eventTemplate: EventTemplate ): void;
		addMinecraftPermutation( condition: string, props: JSO ): void;
		addMaterialInstances( newInstances: any ): void;
		addPartVisibility( materialInstanceName: string, conditions: string[] ): void;
		addProperty( key: string, values: any ): void;
		make(): GeneratedBlockData;
	}

	interface Data {
		blockInfo: {
			key: string,
			name: string,
			fullName: string
			finalPermutation: string
		}
		source: BlockTemplateData;
		extraVars: ExtraVars;
		props: JSO;
		permutations: PermutationRegistry;
		eventTriggers: JSO<EventTrigger>;
		eventHandlers: JSO<{ sequence: JSO[] }>
	}

	type PermutationRegistry= {
		[condition: string]: any
	}

	type MCPermutationTemplate = Pick<McPermutationTemplate, "block_props"|"condition">
}


interface EventTrigger { condition: string[], handler: string, target?: string }

interface EventTemplate {
	action: JSO[],
	event?: string,
	handler?: string
	target?: string,
	condition?: string
	// trigger_items?: string[]
	// properties?: string[]
}


interface EventData {
	handler: string
	trigger_items?: string[]
	properties?: string[]
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

interface PermutationInfoHandler {
	readonly data: PermutationInfo[];
	readonly path: string[];
	getFinalPermution( includeMaterialPermutations?: boolean ): string
}

interface PermutationInfo {
	key: string;
	title?: string;
	type?: 'material' | 'default'
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
		fullName: string
	};
}

/**
 * Block parser methods.
 */
interface PermutationBuilderHandlers {
	readonly permutations: PermutationInfoHandler;

	/**
	 * Reference to the proxy MaterialBuilder
	 */
	materials: MaterialBuilder,

	mergeProps( obj: JSO ): void;
	isValid(): boolean;
	setPermutationData( {
		key,
		title,
		type,
	}: PermutationInfo ): void;
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
	mergeTemplateData( templateData: BlockTemplateData ): void;
	mergePresetSettings( dir: JSO ): void
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
type PermutationBuilder = PermutationBuilderPublicProxyInterface & PermutationBuilderHandlers

interface PermutationBuilderProxy extends PermutationBuilderPublicProxyInterface {
	/**
	 * Permutation methods
	 */
	handlers: PermutationBuilderHandlers

	/**
	 * MaterialBuilder factory
	 */
	materials: MaterialBuilder
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


interface PresetHandlerData {
	params: Partial<PresetTemplate>
	presetName: string
	presetData: Partial<PresetTemplate>;
	presetVars: JSO,
	customVars: JSO;
	actionHooks: JSO;
	presetTemplate: Partial<PresetTemplate>;
};

interface PresetHandler {
	readonly data: PresetHandlerData
	readonly name: string;
	readonly params: Partial<PresetTemplate>;
	readonly presetVars: JSO;
	readonly customVars: JSO;
	readonly presetPropertyVars: {};

	getPresetPropertyData( property: string ): {
		key: string;
		property: string;
		query: string;
		readonly max: number;
		readonly min: number;
	};
	applyActionHook<Params>( hook: string, params: Params ): void
	clone(): PresetHandler;
	setCustomVar( key: string, value: string | number | any[] | JSO ): void;
	setActionHook( hookName: string, func: Function ): void;
	resolvePresetVars(): void;
	createPermutations( permutations: McPermutationTemplate | McPermutationTemplate[] ): void
	createPermutation( permutation: McPermutationTemplate ): void;
	createPartVisibilityRules( partVisibilityConfig: JSO ): void
	createPartVisibilityRule( materialInstanceName: string, conditions: string[], property: string ): void;
	createEvents( {
		events,
		eventTemplates,
		properties
	}: {
		events: PresetTemplate['events']
		eventTemplates: PresetTemplate['event_templates']
		properties?: JSO;
	} ): void
	createEvent( {
		event,
		handler,
		properties,
		triggerItems,
		eventTemplate,
	}: {
		event: string;
		handler: string;
		properties?: JSO;
		triggerItems?: JSO;
		eventTemplate?: EventTemplate;
	} ): void;
	checkRequiredParams(): void;
}

interface McPermutationTemplate {
	block_props: JSO;
	properties?: string[]
	condition?: string;
	key?: string;
}

interface PresetTemplate {
	[x: string]: any
	properties: JSO<number[] | false>
	events: JSO<string | string[]>
	event_templates: {
		[x: string]: {
			action: JSO[]
		}
	}
	permutation_templates: McPermutationTemplate[]
	part_visibility_template: string
	permutations: JSO
	part_visibility: JSO
}

type MaterialInstance = {
	texture: string,
	render_method?: string
	ambient_occlusion?: boolean
	face_dimming?: boolean
}

type MaterialInstanceCollection = {
	[materialInstanceKey: string]: MaterialInstance
}

type MaterialTemplate = {
	title?: string,
	texture?: string
	render_method?: string
	ambient_occlusion?: boolean
	face_dimming?: boolean
}

type MaterialTemplates = {
	[materialKey: string]: MaterialTemplate
}

type MaterialPermutationCollection = {
	[permutationKey: string]: MaterialInstanceCollection
}

type MaterialPermutationStore = {
	[permutationKey: string]: MaterialStoreItem
}

type MaterialStoreItem = {
	title: string,
	materialInstances: MaterialInstanceCollection
}


type MaterialFilter = string[]
type MaterialInstanceFilter = string[]


interface MaterialBuilderData {
	render: {},
	/**
	 * Base data.
	 */
	materialTemplates: MaterialTemplates,

	/**
	 * Exports.
	 */
	materials: MaterialPermutationStore,

	/**
	 * Temp data.
	 */
	materialPermutations: MaterialPermutationStore,
}

/**
 * Material builder factory.
 */
type MaterialBuilder = {
	data: MaterialBuilderData
	/**
	 * Parse template data and extract materials.
	 */
	extractMaterials( templateData: BlockTemplateData ): void
	generatePermutations(): void
}


interface ExtraVars {
	prefix: string,
	permutation: string,
	variant: string,
	material: string
	blockName: string,
}
