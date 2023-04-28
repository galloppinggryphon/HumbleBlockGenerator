import GeneratorLog from './generator-log.js'

const logger = GeneratorLog()

const generatorPaths = {
	bundledPresetsDir: 'src/builder/block-generator/presets',
}

const minecraftProps = {
	skip: [ 'identifier' ],
	root: [ 'components', 'description', 'events', 'permutations' ],
	description: [ 'properties', 'register_to_creative_menu', 'is_experimental' ],
	props: {
		description: {},
		components: {},
		events: {},
		permutations: [],
	},
}

const magicExpressionMetaDivider = '::'
const magicExpressionPathDivider = '.'

const variablePrefix = '$'
const variantPrefix = '>>'
const calculatedPropPrefix = '%' // magicExpressionPrefix
const expressionPrefix = '`'

const mergeKeySuffix = '[]'
const mergeKeySuffixRx = String.raw `\[\]`

/**
 * Static props are added directly to the block model, without processing or validation.
 */
const staticPropPrefix = '§'// todo: change to &

const directivePrefix = '@'
/**
 * All template directives
 */
const directives = [ 'apply', 'events', 'export', 'materials', 'exclude_materials', 'material_templates', 'material_permutations', 'material_instances', 'part_visibility', 'render', 'texture', 'title', 'type', 'variants' ]
/**
 * All directives used to generate materials.
 */
const materialDirectives = [ 'texture', 'materials', 'exclude_materials', 'render', 'material_templates', 'material_instances', 'material_permutations' ]

const specialProps = [ 'identifier', 'creative_category', 'permutations', 'properties' ]

/**
 * Control how data is accumulated/merged when adding permutations with existing props/directives.
 */
const permutationAccumulatorConfig = {
	dir: {
		title: null,
		variants: null,
		apply: 'mergeObject',
		materials: 'mergeObject',
		render: 'mergeObject',
		events: 'mergeObject',
		permutations: 'mergeArray',
	},
	props: {
		material_instances: 'mergeObject',
		events: 'mergeObject',
		permutations: 'mergeArray',
		properties: 'mergeObject',
	},
}

const strictCharsGroup = '[\\w\\d_.]'
const regexFilters = {
	// Character group
	strictCharsGroup,

	/**
	 * Prefixes are added to this list programmatically.
	 *
	 * Returns four groups: <`key`, `prefix`, `suffix`>
	 *
	 * @see {@link PresetKeyMatch}
	 */
	presetKeyMatch: new RegExp( `^(?<key>(?<prefix>[$]?)[\\w_.:]+)(?<suffix>${ mergeKeySuffixRx })?$`, 'i' ),

	/**
	 * **Parse magic expression**
	 *
	 * Return groups: `expression`, preset_property, divider, sub_key, dynamic_key
	 *
	 * **Patterns**
	 * |||
	 * | -------------------------- | ----------------------------------------- |
	 * | Path value:     			| `%preset_property.sub_key` 				|
	 * | Dynamic path value:		| `%preset_property.[%magic_expression]` 	|
	 * | Calculated prop:     		| `%preset_property::meta_key` 				|
	 * | Dynamic path value:		| `%preset_property::` 						|
	 *
	 * **Valid characters**\
	 * preset_property/sub_key: `[\\w\\d_]`
	 * meta_key: Whole magicExpression
	 *
	 *
	 * **See**
	 * * {@link MagicExpressionData} for valid meta keys/calculated props
	 * * {@link MagicExpressionMatch} -- the object returned
	 * */
	magicExpressionMatch: new RegExp( `(?<expression>%(?<preset_property>[\\w\\d_]+)(?<divider>(?:\\.)|(?:::))(?:(?<sub_key>[\\w\\d_]+)|(?:\\[(?<dynamic_key>[^[\\]]+)\\])))`, 'ig' ),

}

/**
 * Separators for names and titles.
 */
const defaultSeparators = {
	names: { '*': '.' },
	titles: { '*': ' - ' },
}

export { defaultSeparators, directives, directivePrefix, generatorPaths, logger, expressionPrefix, magicExpressionMetaDivider, magicExpressionPathDivider, materialDirectives, mergeKeySuffix, minecraftProps, specialProps, staticPropPrefix, regexFilters, permutationAccumulatorConfig, calculatedPropPrefix, variablePrefix, variantPrefix }
