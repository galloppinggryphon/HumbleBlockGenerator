// All template directives, except 'variants'
const directives = [ 'apply', 'export', 'materials', 'render', 'texture', 'textures', 'title' ]

// Other keys used during processing
const specialProcessingKeys = [ 'permutationData', 'permutationPath', 'materialData' ]

const specialMinecraftProps = [ 'identifier', 'material_instances', 'geometry', 'creative_category', 'permutations', 'events', 'properties' ]

const defaultSeparators = {
	names: { '*': '.' },
	titles: { '*': ' - ' },
}

export { directives, specialProcessingKeys, specialMinecraftProps, defaultSeparators }
