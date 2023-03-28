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

const variablePrefix = '$'
const variantPrefix = '>>'
const calculatedPropPrefix = '%'
const expressionPrefix = '`'

/**
 * Static props are added directly to the block model, without processing or validation.
 */
const staticPropPrefix = '§'

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

/**
 * Separators for names and titles.
 */
const defaultSeparators = {
	names: { '*': '.' },
	titles: { '*': ' - ' },
}

export { defaultSeparators, directives, directivePrefix, generatorPaths, logger, expressionPrefix, materialDirectives, minecraftProps, specialProps, staticPropPrefix, permutationAccumulatorConfig, calculatedPropPrefix, variablePrefix, variantPrefix }
