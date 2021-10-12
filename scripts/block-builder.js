'use strict'
const _ = require( 'lodash' )
const nodePath = require( 'path' )
const { arrayDeduplicate, log, removeArrayElements, removeObjectKeys } = require( './utils.js' )
const { saveFileAsync, loadJsonFiles } = require( './fs-utils.js' )

// All template directives
const directives = [ 'apply', 'export', 'materials', 'render', 'texture', 'textures', 'title', 'type' ]

// Other keys used during processing
const specialProcessingKeys = [ 'permutationData', 'permutationPath', 'materialData' ]

const specialMinecraftProps = [ 'identifier', 'material_instances', 'geometry' ]

const dataAccumulatorMethods = {
	apply: 'mergeObject',
	materials: 'mergeObject',
	render: 'mergeObject',
	textures: 'mergeArray',
	title: 'permutation',
	type: 'permutation',
}

const defaultSeparators = {
	name: { '*': '.' },
	title: { '*': ' - ' },
}

// make appData and json files available globally
const appData = {}

const generatorLog = GeneratorLog()

/**
 * Main process for generating blocks.
 *
 * @param {object} config
 * @param {object} templateData
 */
function blockBuilder( config, templateData ) {
	appData.templateData = templateData
	appData.config = config
	appData.outputPath = config.outputPath

	const { nameSeparators } = config.output
	appData.config.nameSeparators = ( nameSeparators && Object( nameSeparators ) === nameSeparators && ! Array.isArray( nameSeparators ) ) ? nameSeparators : defaultSeparators.name

	const { titleSeparators } = config.output
	appData.config.titleSeparators = ( titleSeparators && Object( titleSeparators ) === titleSeparators && ! Array.isArray( titleSeparators ) ) ? titleSeparators : defaultSeparators.title

	const blockTitles = []
	let blockCounter = 0
	const { blocks } = config.input
	const blocksArr = Array.isArray( blocks ) ? blocks : [ blocks ]

	// Traverse all requested block template files
	blocksArr.forEach( ( file ) => {
		const fileName = nodePath.basename( file )
		log( `\n\n[${ fileName }]` )

		generatorLog.setContext( { fileName } )

		let blockData
		try {
			blockData = loadJsonFiles( file, true )

			if ( blockData === false ) {
				console.error( 'Error - file not found!' )
				return
			}
			if ( blockData === '' ) {
				console.error( 'Error - invalid JSON!' )
				return
			}
		}
		catch ( error ) {
			console.error( `An error occurred while trying to read or parse the file.` )
			console.error( error )
			return
		}

		// Run blockGenerator on each root category
		// generator requires 'for of'
		for ( const block of blockGenerator( fileName, blockData ) ) {
			blockCounter++

			const { identifier, permutationPath, title, data } = block
			const fileInfo = getBlockFileInfo( permutationPath )

			log( `${ identifier } ➡  ${ fileInfo.dynamicFileName }` )

			saveBlockToJson( getPermutationName( permutationPath ), fileInfo, data )

			// keep title and save at the end
			// tile.prefix:blockname.name=Block Title
			const { prefix } = config
			blockTitles.push( `tile.${ prefix }:${ identifier }.name=${ title }` )
		}
	} )

	if ( blockCounter ) {
		// save titles
		const { language, outputDir } = config.output
		saveFileAsync( outputDir, `${ language }.lang`, blockTitles.join( '\n' ) )

		log( `\n◽◽◽\nGenerated ${ blockCounter } block${ blockCounter > 1 ? 's' : '' }` )
	}
	else {
		log( `\n◽◽◽\nUh-oh, no blocks were generated.` )
	}

	generatorLog.display()
}

/**
 * Iterate over block data recursively and return one block for every time it is invoked.
 *
 * @param {string} fileName For debugging and errors
 * @param {Object} blockData Data to iterate over
 * @param {string} permutationKey Current key
 * @param {Object} data Data accumulator
 * @return {Object} A single block
 */
function * blockGenerator( fileName, blockData, permutationKey = undefined, data = {} ) {
	// Initialize on first iteration
	if ( permutationKey === undefined ) {
		for ( const [ key, level ] of Object.entries( blockData ) ) {
			yield * blockGenerator( fileName, level, key )
		}
		return
	}

	// Skip permutation if export is disabled
	if ( blockData.export === false ) {
		return
	}

	// Process permutation
	data.permutationPath = data.permutationPath || []
	data.permutationPath.push( permutationKey )

	data.permutationData = data.permutationData || {}
	data.permutationData[ permutationKey ] = {}

	// data.permutationData[ permutationKey ] = { type: blockData.type || '' }

	generatorLog.setContext( { permutationPath: data.permutationPath } )

	// log( { fileName, permutationKey, permutationPath: data.permutationPath } )
	// log( { permutationKey, branch: isPermutationBranch( permutationKey ) } )

	// No empty root
	if ( data.permutationPath.length === 1 ) {
		if ( ! validatePermutationName( permutationKey ) ) {

			generatorLog.error( `Invalid root key: '${ permutationKey }'. Processing of this block is skipped.` )
			return
		}
	}
	// No empty key if it has children
	if ( permutationKey === '' && blockData.permutations ) {
		generatorLog.error( `Invalid permutation key: '${ permutationKey }'. An empty permutation key is only permitted for the deepest level, use '-' to create anonymous branches. Processing of this branch is skipped.` )

	}
	else if ( permutationKey && ! validatePermutationName( permutationKey ) && ! isPermutationBranch( permutationKey ) ) {
		generatorLog.error( `Invalid permutation key: '${ permutationKey }'. Processing of this branch is skipped.` )
		return
	}

	// Missing title?
	if ( ! blockData.title ) {
		blockData.title = permutationKey && ! isPermutationBranch( permutationKey ) ? permutationKey : ''
	}

	// Process blockData properties
	for ( const [ key, value ] of Object.entries( blockData ) ) {
		if ( key !== 'permutations' ) {
			data = addBlockGeneratorData( key, value, permutationKey, data, dataAccumulatorMethods[ key ] )
		}
	}

	// Recursively iterate through permutation branches
	const { permutations } = blockData
	if ( permutations ) {
		for ( const [ key, levelData ] of Object.entries( permutations ) ) {
			// Each level inherits from its parent, but must not mutate its parent
			const _data = _.cloneDeep( data )
			yield * blockGenerator( fileName, levelData, key, _data )
		}
	}
	// ~ Reached the deepest permutation of this branch ~
	// Process data and generate blocks
	else {
		// The final permutation cannot be a branch
		if ( isPermutationBranch( permutationKey ) ) {
			generatorLog.error( `Invalid permutation key: '${ permutationKey }'. The deepest permutation cannot be an anonymous branch. Processing of this branch is skipped.` )
			return
		}

		// Some minecraft keys require processing - remove prefix if present
		Object.keys( data ).forEach( ( key ) => {
			if ( key.substring( 0, 10 ) === 'minecraft:' ) {
				data[ key.slice( 10 ) ] = data[ key ]
				delete data[ key ]
			}
		} )

		Object.keys( data ).filter( ( key ) => {
			if ( specialMinecraftProps.includes( key ) && key.substring( 0, 10 ) === 'minecraft:' ) {
				data[ key.slice( 10 ) ] = data[ key ]
				delete data[ key ]
			}
		} )

		// Apply presets with the apply directive -- translate keys to required minecraft props
		if ( data.apply ) {
			data = applyBlockPresets( data )
		}

		if ( data.identifier ) {
			generatorLog.notice( `Found the 'identifier' property, but this has has no effect. Block identifiers are compiled from permutation keys.` )
		}

		// Generate texture/material permutations
		const { geometry, material_instances, materials, texture, textures } = data

		if ( material_instances ) {
			if ( ! geometry ) {
				generatorLog.error( `Found the 'material_instances' property, but missing required property 'geometry'.` )
			}

			if ( texture ) {
				generatorLog.warn( `Found both the 'material_instances' property and 'texture' directive, but these cannot be used together. Ignoring 'texture'.` )
			}

			// !!Validate MIs here

			data.materials = undefined
			data.textures = undefined
		}
		else if ( texture ) {
			if ( ! geometry ) {
				generatorLog.error( `Found the 'texture' directive, but missing required property 'geometry'.` )
			}
			else {
				data.material_instances = {
					'*': prepareMaterialInstance( texture, 'texture' ),
				}
			}

			data.materials = undefined
			data.textures = undefined
			data.texture = undefined
		}
		else if ( materials ) {
			if ( ! geometry ) {
				generatorLog.error( `Found the 'materials' directive, but missing required property 'geometry'.` )
			}

			if ( textures ) {
				generatorLog.warn( `Found both the 'materials' directive and the 'textures' directive, but these cannot be used together. Ignoring 'textures'.` )
				data.textures = undefined
			}

			if ( ! Object( materials ) === materials || Array.isArray( materials ) ) {
				generatorLog.error( `The 'materials' directive is not configured correctly, expected an object (key-value pairs enclosed in {}).` )
				data.materials = undefined
			}
		}
		else if ( textures ) {
			if ( ! geometry ) {
				generatorLog.error( `Found the 'textures' directive, but missing required property 'geometry'.` )
			}

			if ( ! Array.isArray( textures ) && ! textures.length ) {
				generatorLog.error( `The 'textures' directive does not contain a valid array (list enclosed in []).` )
				data.textures = undefined
			}
		}

		// ~ Split streams - with and without texture ~
		if ( ! Object.keys( data.material_instances || {} ).length && ( data.materials || data.textures ) ) {
			// Check the render directive
			if ( data.render ) {
				if ( data.render.texture ) {
					generatorLog.warn( `The 'render' directive contains invalid data: the 'texture' key cannot be used here.` )
					delete data.render.texture
				}

				data.render = prepareMaterialInstance( { ...data.render, texture: 1 }, 'render' )
				delete data.render.texture
			}

			// Process textures and materials
			data = processBlockMaterials( data )

			// Create property permutations based on materials
			// yield doesn't work with forEach
			for ( const [ key, material ] of Object.entries( data.materialData ) ) {
				let _data = _.cloneDeep( data )
				_data.permutationPath.push( `${ key }` ) // delineate texture from other permutations
				_data.permutationData[ key ] = {
					title: key,
					type: 'material',
				}
				// Create material_instances for current permutation
				_data.material_instances = material
				_data = removeObjectKeys( _data, directives )

				const block = prepareBlock( _data )
				yield block
			}
		}
		else {
			const block = prepareBlock( data )
			yield block
		}
	}
}

/**
 * Generate block JSON from generator data. Called for every final permutation.
 *
 * @param data
 * @return {object}
 */
function prepareBlock( data ) {
	const { geometry, permutationPath, material_instances } = data
	const { templateData, config } = appData

	// log( { data } )

	const permutationTitle = getPermutationTitle( data )
	let identifier = getPermutationName( data )

	// minecraft:block section, with required subsections
	let block = { components: {}, description: {} }
	block.description.identifier = `${ config.prefix }:${ identifier }`

	if ( geometry ) {
		block.components.geometry = `geometry.${ geometry }`
		block.components.material_instances = material_instances
	}

	// Add all other props without processing
	block = addMinecraftProps( block, data )

	// Prefix all component keys with minecraft:
	block.components = Object.entries( block.components ).reduce( ( _componenents, [ key, value ] ) => {
		if ( key.substring( 0, 10 ) !== 'minecraft:' ) {
			key = `minecraft:${ key }`
		}
		_componenents[ key ] = value
		return _componenents
	}, {} )

	// Apply scaffolding
	const template = _.cloneDeep( templateData.scaffolding || {} )
	const blockData = block
	template[ 'minecraft:block' ] = _.merge( template[ 'minecraft:block' ], blockData )

	return { identifier, permutationPath, title: permutationTitle, data: template }
}

/**
 * Process textures and materials directives, create material instances.
 */
function processBlockMaterials( data ) {
	if ( data.textures ) {
		// Convert textures array to materials object
		if ( data.textures ) {
			const materials = data.textures.reduce( ( results, _texture ) => {
				results[ _texture ] = true
				return results
			}, {} )

			data.materials = materials
		}
	}

	if ( data.materials ) {
		const materials = Object.entries( data.materials ).reduce( ( _materials, [ name, materialData ] ) => {
			if ( materialData === true ) {
				materialData = name
			}

			if ( typeof materialData === 'string' ) {
				_materials[ name ] = {
					'*': prepareMaterialInstance( materialData, 'materials', data.render ),
				}
			}
			else if ( Object( materialData ) ) {
				// Walk though each material instance object
				_materials[ name ] = Object.entries( materialData ).reduce( ( instances, [ instanceName, material ] ) => {
					instances[ instanceName ] = prepareMaterialInstance( material, `materials->${ name }->${ instanceName }`, data.render )
					return instances
				}, {} )
			}
			else {
				generatorLog.error( `The 'materials' directive contains invalid data.`, { key: name, data: materialData } )
				return _materials
			}

			validateMaterialInstanceMap( _materials[ name ], `materials->${ name }` )

			return _materials
		}, {} )

		data.materialData = _.merge( data.materials, materials )
	}
	return data
}

/**
 * Create material instance object.
 *
 * @param {array|object} materialInstance
 */
function prepareMaterialInstance( materialInstance, key, render = undefined ) {
	let _materialInstance = materialInstance

	if ( typeof materialInstance === 'string' ) {
		_materialInstance = {
			'texture': materialInstance,
		}
	}
	else if ( Array.isArray( materialInstance ) ) {
		generatorLog.error( `The '${ key }' directive or key cannot contain arrays, only strings or objects.`, { value: materialInstance } )
		return {}
	}
	else if ( Object( materialInstance ) !== materialInstance ) {
		generatorLog.error( `The '${ key }' directive or key must contain an object.`, { value: materialInstance } )
		return {}
	}

	// Apply the render directive
	if ( render ) {
		// render_method must be the same
		if ( _materialInstance.render_method ) {
			delete _materialInstance.render_method
		}
		_materialInstance = Object.assign( render, _materialInstance )
	}

	return _materialInstance
}

/**
 * Check material instance render method.
 *
 * @param {object} materialInstance
 * @param {string} key Key of the directive used to apply materials, for error conditions.
 * @return {boolean}
 */
function validateRenderMethod( materialInstance, key ) {
	const validRenderMethods = [ 'opaque', 'blend', 'alpha_test', 'double_sided' ]

	const { render_method } = materialInstance

	if ( render_method && ! validRenderMethods.includes( render_method ) ) {
		generatorLog.error( `The '${ key }' directive or key contains bad data: invalid value for 'render_method' (render_method: ${ render_method })` )
		return false
	}

	return true
}

/**
 * Check that material instance object is correctly formatted.
 *
 * @param {object} materialInstance
 * @param {string} key Key of the directive used to apply materials, for error conditions.
 */
function validateMaterialInstance( materialInstance, key ) {
	const { texture } = materialInstance
	if ( ! texture ) {
		generatorLog.error( `The '${ key }' directive or key contains an invalid material instance: required key 'texture' is missing.` )
		return {}
	}

	// log( { materialInstance } )
	const invalidKeys = removeArrayElements( Object.keys( materialInstance ), [ 'ambient_occlusion', 'face_dimming', 'render_method', 'texture' ] )

	if ( invalidKeys.length ) {
		generatorLog.warn( `The '${ key }' directive or key contains bad material instance data: the key(s) '${ invalidKeys.join( ', ' ) }' are not recognized'.` )
	}

	if ( validateRenderMethod( materialInstance, key ) ) {
		return {}
	}

	return true
}

/**
 * Validate minecraft:material_instances.
 * @param {object} materialInstances
 * @param {string} key Key of the directive used to apply materials, for error conditions.
 */
function validateMaterialInstanceMap( materialInstances, key ) {
	const miArray = Object.entries( materialInstances )

	// Check that there is a default key
	const hasDefault = miArray.some( ( [ _key ] ) => _key === '*' )
	if ( ! hasDefault ) {
		generatorLog.warn( `The '${ key }' directive or key contains a material instance map, but is missing the '*' key (a default material instance).` )
	}

	// eslint-disable-next-line no-unused-vars
	miArray.forEach( ( [ _key, materialInstance ] ) => validateMaterialInstance( materialInstance, key ) )
}

/**
 * Process block data and inject template snippets.
 */
function applyBlockPresets( data ) {
	const { templateData } = appData

	// Walk through presets collection
	for ( const [ preset, presetVariation ] of Object.entries( data.apply ) ) {
		// Template is disabled
		if ( presetVariation === false ) {
			generatorLog.error( `Skipping disabled preset '${ preset }'.` )
			continue
		}

		if ( ! templateData.presets ) {
			generatorLog.error( `Cannot apply preset '${ preset }': no preset file is loaded.` )
			continue
		}

		// Check if a feature variation is requested - and if it exists
		const presets = templateData.presets[ preset ]

		if ( presets ) {
			// Request template variation?
			if ( typeof presetVariation === 'string' || typeof presetVariation === 'number' ) {

				if ( presets[ presetVariation ] ) {
					data = addMinecraftProps( data, presets[ presetVariation ] )

					// add'common' section if present
					if ( presets.common ) {
						data = addMinecraftProps( data, presets.common )
					}
				}
				else {
					generatorLog.error( `Invalid preset variation.`, { preset, variation: presetVariation } )
				}
			}
			else {
				data = addMinecraftProps( data, presets )
			}
		}
		else {
			generatorLog.error( `Invalid preset.`, { preset } )

		}
	}

	return data
}

/**
 * Fill out necessary block definition sections and props.
 */
function addMinecraftProps( block, data, section = 'components' ) {
	const blockSections = [ 'components', 'description', 'events' ] // excl. 'permutations'

	if ( section ) {
		block[ section ] = section in block ? block[ section ] : {}
	}

	Object.entries( data ).forEach( ( [ key, el ] ) => {
		// Exclude special keys
		if ( directives.includes( key ) || specialMinecraftProps.includes( key ) || specialProcessingKeys.includes( key ) ) {
			return
		}

		if ( Object( el ) === el ) {
			if ( key === 'permutations' ) {
				block[ key ] = key in block ? block[ key ] : []
				block[ key ] = block[ key ].concat( el )
			}
			else if ( blockSections.includes( key ) ) {
				block[ key ] = mergeBlockData( key, block[ key ], el )
			}
			else {
				block[ section ][ key ] = mergeBlockData( key, block[ section ][ key ], el )
			}
		}
		else {
			block[ section ][ key ] = el
		}
	} )

	return block

	function mergeBlockData( key, obj1, obj2 ) {
		return _.mergeWith( obj1, obj2, ( objValue, srcValue, propName ) => {
			if ( Array.isArray( srcValue ) ) {
				objValue = objValue === undefined ? [] : objValue
				if ( ! Array.isArray( objValue ) ) {
					generatorLog.error( `Type mismatch - cannot add data to block. Expected existing data to be array, not ${ typeof objValue }. Object path: ${ key }.${ propName }.` )
					return objValue
				}
				// Concatenate events sequence
				if ( propName === 'sequence' ) {
					return objValue.concat( srcValue )
				}
				// Merge and deduplicate everything else
				else {
					return [ ... objValue, ...srcValue ] // arrayDeduplicate( objValue, srcValue )
				}
			}

			return undefined

		} )
	}
}

/**
 * Add key-value pair to the generator accumulator object by concatenation, merging or other process.
 *
 * @param {string} key
 * @param {*} value
 * @param {'add', 'mergeArray'|'mergeObject'|'push'|'permutation'} method
 */
function addBlockGeneratorData( key, value, permutationKey, data, method ) {
	const oldType = Object( data[ key ] ) === data[ key ] ? ( Array.isArray( data[ key ] ) ? 'array' : 'object' ) : null
	const newType = Object( value ) === value ? ( Array.isArray( value ) ? 'array' : 'object' ) : null
	const permutationName = getPermutationName( data.permutationPath, '/' )

	switch ( method ) {
		case 'mergeArray':
			if ( newType !== 'array' ) {
				throw new Error( `Unexpected value - expected an array.\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}
			if ( data[ key ] && oldType !== newType ) {
				throw new Error( `Cannot merge data with this property because of type mismatch (existing type: ${ oldType }, new type: ${ newType }).\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}

			data[ key ] = data[ key ] || []
			data[ key ] = arrayDeduplicate( data[ key ], value )
			break

		case 'mergeObject':
			if ( newType !== 'object' ) {
				throw new Error( `Unexpected value - expected an object.\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}
			if ( data[ key ] && oldType !== newType ) {
				throw new Error( `Cannot merge data with this property because of type mismatch (existing type: ${ oldType }, new type: ${ newType }).\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}

			data[ key ] = data[ key ] || {}
			data[ key ] = _.merge( data[ key ], value )
			break

		case 'push':
			if ( data[ key ] && oldType !== 'array' ) {
				throw new Error( `Cannot push value to this property, not an array.\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}
			data[ key ] = data[ key ] || []
			data[ key ].push( value )
			break

		// Add key to permutationData object
		case 'permutation':
			data.permutationData[ permutationKey ][ key ] = value
			break

		default: // replace
			data[ key ] = value
	}
	return data
}

/**
 * Save block JSON to disk.
 *
 * @param {string[]} componentPath
 * @param {Object<string, any>} data
 */
function saveBlockToJson( identifier, fileInfo, data ) {
	const { fullPath, fileName } = fileInfo
	const json = JSON.stringify( data, null, 4 )
	let result
	try {
		result = saveFileAsync( fullPath, fileName, json )
	}
	catch ( error ) {
		console.error( error )
		return
	}
	return result
}

/**
 * Generate path and fileName for behaviour pack block definition.
 *
 * @param {string[]} componentPath
 */
function getBlockFileInfo( permutationPath ) {
	const { outputDir, pathSegmentation } = appData.config.output

	// Create directories for permutation segments?
	// Make copy of permutationPath first
	permutationPath = [ ...permutationPath ].filter( ( x ) => x && ! isPermutationBranch( x ) )

	let _pathSegmentation = Number( pathSegmentation ) || 0
	if ( _pathSegmentation ) {
		if ( permutationPath.length <= _pathSegmentation ) {
			_pathSegmentation = permutationPath.length - 1
		}
	}

	let dirPath, fileName
	if ( _pathSegmentation ) {
		dirPath = permutationPath.slice( 0, _pathSegmentation )
		fileName = permutationPath.slice( _pathSegmentation ).join( '_' )
	}
	else {
		dirPath = []
		fileName = permutationPath.join( '_' )
	}

	// #todo: Not all of these keys are necessary?
	fileName = `${ fileName }.json`
	const blockDir = nodePath.join( outputDir, 'blocks' )
	const fileInfo = {}
	fileInfo.fileName = fileName
	fileInfo.nodePath = nodePath.resolve( '.' )
	fileInfo.blockDir = blockDir
	fileInfo.outputPath = nodePath.resolve( '.', outputDir )
	fileInfo.dynamicFileName = nodePath.join( ...dirPath, fileInfo.fileName )
	fileInfo.fullPath = nodePath.resolve( '.', blockDir, ...dirPath )
	fileInfo.fullName = nodePath.resolve( fileInfo.fullPath, fileInfo.fileName )

	return fileInfo
}

/**
 * Generate name from nested permutations.
 *
 * @param {object} data Block generator data
 * @param {string} separator String to separate permutations
 */
function getPermutationName( data, separator = undefined ) {
	const { nameSeparators } = appData.config.output

	if ( Array.isArray( data ) ) {
		separator = separator || nameSeparators[ '*' ]
		return data
			.filter( ( permutation ) => permutation && ! isPermutationBranch( permutation ) )
			.join( separator )
	}
	else {
		const { permutationPath, permutationData } = data
		return getPermutationStringFromTemplate( 'name', permutationPath, permutationData, nameSeparators )
	}
}

/**
 * Generate name from title attribute in nested permutations.
 *
 * @param {object} data Block generator data
 */
function getPermutationTitle( data ) {
	const { titleSeparators } = appData.config.output
	const { permutationPath, permutationData } = data
	return getPermutationStringFromTemplate( 'title', permutationPath, permutationData, titleSeparators )
}

/**
 * Process permutation name according to template.
 *
 * @param {string} whichString
 * @param {*} permutations
 * @param {*} permutationData
 * @param {*} separators
 */
function getPermutationStringFromTemplate( whichString, permutations, permutationData, separators ) {
	const separator = separators[ '*' ]
	return permutations
		.filter( ( permutation ) => permutation && ! isPermutationBranch( permutation ) )
		.reduce( ( results, permutation, i ) => {
			const string =
				( whichString === 'name' && permutation )
				|| ( whichString === 'title' && permutationData[ permutation ]?.title )

			if ( ! i ) {
				results.push( string )
				return results
			}

			const type = permutationData[ permutation ]?.type
			let sep = separators[ type ] || separator

			if ( Array.isArray( sep ) ) {
				results.push( sep[ 0 ], string )
				sep[ 1 ] && results.push( sep[ 1 ] )
			}
			else {
				results.push( sep, string )
			}
			return results
		}, [] )
		.join( '' )
}

/**
 * Validate permutation name.
 *
 * @param {string} name
 */
function validatePermutationName( name ) {
	const rxValidName = /[a-z][a-z0-9_\-.()]*/i
	return rxValidName.test( name )
}

/**
 * Check permutation segment name to check if it's an anonymous branch.
 *
 * @param {string} name
 */
function isPermutationBranch( name ) {
	const rxAnonymous = /[-]+/
	return rxAnonymous.test( name )
}

/**
 * Logging factory.
 */
function GeneratorLog() {
	const _log = {}
	let context = { fileName: undefined, permutation: undefined, permutationPath: [] }

	return {
		error( message, ...errorData ){
			return logItem( 'error', message, errorData )
		},
		warn( message, ...errorData ){
			return logItem( 'warn', message, errorData )
		},
		notice( message, ...errorData ) {
			return logItem( 'notice', message, errorData )
		},
		display() {
			const __log = Object.entries( _log )
			if ( ! __log.length ) {
				return
			}

			log( '\n===  Log messages ===' )

			let errorFlag = false
			let currentFile
			__log.forEach( ( [ fileName, items ] ) => {
				if ( ! items.length ) {
					return
				}

				if ( fileName !== currentFile ) {
					log( `\n[${ fileName }]` )
					currentFile = fileName
				}

				items.forEach( ( item ) => {
					if ( item.level === 'error' ) {
						errorFlag = true
					}
					log( formatLogItem( item ) )
				} )
			} )

			if ( errorFlag ) {
				log( '\n~~~ WARNING! ~~~\nErrors were encountered during processing!\nOne or more blocks contain invalid syntax, are incomplete, or have not been exported.' )
			}
		},

		/**
		 * @param {Object} contextData { fileName = undefined, permutationPath = undefined }
		 */
		setContext( contextData ) {
			Object.assign( context, contextData )

			if ( context.permutationPath && context.permutationPath.length ){
				context.permutation = getPermutationName( context.permutationPath, '/' )
			}
			else {
				context.permutation = undefined
			}
		},
		write() {},
	}

	function logItem( level, msg, errorData ) {
		const store = context.fileName ? context.fileName : ''
		_log[ store ] = _log[ store ] || []
		_log[ store ].push( {
			level,
			permutation: context.permutation,
			msg,
			errorData: prepErrorData( errorData ),
		} )
		return _log[ store ][ _log[ store ].length - 1 ]
	}

	function prepErrorData( errorData ) {
		if ( ! errorData.length ) {
			return
		}
		let _errorData = errorData
		if ( errorData.length === 1 ) {
			_errorData = errorData[ 0 ]
		}

		return JSON.stringify( _errorData, false, 2 )
	}

	function formatLogItem( item ) {
		const labels = { 'error': 'ERROR', 'warn': 'WARNING', 'NOTICE': 'Notice' }

		const contextString = item.permutation ? `[${ item.permutation }] ` : ''

		let _item = `${ contextString }${ labels[ item.level ] }: ${ item.msg }`
		_item += item.errorData ? ` Error data: \n${ item.errorData }` : ''
		return _item
	}
}

exports.blockBuilder = blockBuilder
