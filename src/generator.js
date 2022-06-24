'use strict'
import _ from 'lodash'
import chalk from 'chalk'
import nodePath from 'path'
import { arrayDeduplicate, log, removeArrayElements, removeObjectKeys } from './lib/utils.js'
import { saveFileAsync, loadJsonFiles } from './lib/fs-utils.js'
import { saveBlockToJson, getBlockFileInfo, getPermutationName, getPermutationTitle, validatePermutationName, isPermutationBranch } from './generator-utils.js'
import { directives, specialProcessingKeys, specialMinecraftProps, defaultSeparators } from './generator-config.js'
import appData from './app-data.js'
import GeneratorLog from './generator-log.js'

const logger = GeneratorLog()

/**
 * Main process for generating blocks.
 *
 * @param {object} config
 * @param {object} templateData
 */
export function blockBuilder() {
	const { config, blockInput, outputPath } = appData
	const { nameSeparators, titleSeparators } = config.output

	appData.separators = {
		names: (
			( Object( nameSeparators ) === nameSeparators && ! Array.isArray( nameSeparators ) )
				? nameSeparators
				: defaultSeparators.name
		),

		titles: (
			( Object( titleSeparators ) === titleSeparators && ! Array.isArray( titleSeparators ) )
				? titleSeparators
				: defaultSeparators.title
		),

	}

	const blockTitles = []
	let blockCounter = 0

	// Traverse all requested block template files
	blockInput.forEach( ( file ) => {
		const fileName = nodePath.basename( file )
		log( '\n' )
		logger.print.section( fileName )

		logger.setContext( { fileName } )

		let blockData
		try {
			blockData = loadJsonFiles( file, true )

			if ( blockData === false ) {
				logger.print.error( 'File not found!', file )
				return
			}
			if ( blockData === '' ) {
				logger.print.error( 'Cannot read file, invalid JSON.' )
				return
			}
		}
		catch ( error ) {
			logger.print.error( `Unable to read or parse file.`, file, error )
			return
		}

		// Run blockGenerator on each root category
		// generator requires 'for of', can't use forEach or map
		for ( const block of blockGenerator( fileName, blockData ) ) {
			blockCounter++

			const { identifier, permutationPath, title, data } = block
			const fileInfo = getBlockFileInfo( permutationPath )

			// Log progress to screen
			log( chalk.white( identifier ), chalk.cyan( ' ⇒  ' ), chalk.white( fileInfo.dynamicFileName ) ) //  ▶  ▸▸▸ ►►► ⇒
			// log( `${ identifier } ➡  ${ fileInfo.dynamicFileName }` )

			// Save to file
			saveBlockToJson( getPermutationName( permutationPath ), fileInfo, data )

			// Store titles to save in text file when processing is done
			// tile.prefix:blockname.name=Block Title
			const { prefix } = config
			blockTitles.push( `tile.${ prefix }:${ identifier }.name=${ title }` )
		}
	} )

	// Generate text file with block titles
	const { language } = config.output
	const textDir = nodePath.join( outputPath, 'RP', 'texts' )

	saveFileAsync( textDir, `${ language }.lang`, blockTitles.join( '\n' ) )

	const marginLeft = 3
	const line = 58
	const result = []
	let strLen = 0

	if ( blockCounter ) {
		const prefix = 'Generated'
		const rawNumField = ` ${ blockCounter } `
		const suffix = `block${ blockCounter > 1 ? 's' : '' }`
		const numField = chalk.bgYellow( rawNumField )

		strLen = prefix.length + rawNumField.length + suffix.length
		result.push( prefix, numField, suffix )
	}
	else {
		const rawMsg = 'Uh-oh, no blocks were generated.'
		result.push( chalk.yellow( rawMsg ) )
		strLen = rawMsg.length
	}

	const spacePadding = ' '.repeat( line - marginLeft - strLen - result.length - 1 )

	log( '\n' )
	log( '╔══', chalk.bgCyanBright( chalk.bold( '  BLOCK GENERATOR COMPLETE  ' ) ), '══════════════════════════╗' ) // ╔ ═ ╗╚ ╝║
	log( `║${ ' '.repeat( line ) }║` )
	log( '║  ', ...result, spacePadding, '║' )
	log( `║${ ' '.repeat( line ) }║` )
	log( '╚══════════════════════════════════════════════════════════╝' ) // n = 50

	log()
	logger.display()
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

	logger.setContext( { permutationPath: data.permutationPath } )

	// log( { fileName, permutationKey, permutationPath: data.permutationPath } )
	// log( { permutationKey, branch: isPermutationBranch( permutationKey ) } )

	// No empty root
	if ( data.permutationPath.length === 1 ) {
		if ( ! validatePermutationName( permutationKey ) ) {

			logger.error( `Invalid root key: '${ permutationKey }'. Processing of this block is skipped.` )
			return
		}
	}
	// No empty key if it has children
	if ( permutationKey === '' && blockData.variants ) {
		logger.error( `Invalid permutation key: '${ permutationKey }'. An empty permutation key is only permitted for the deepest level, use '-' to create anonymous branches. Processing of this branch is skipped.` )

	}
	// No invalid permutation name
	else if ( permutationKey && ! validatePermutationName( permutationKey ) && ! isPermutationBranch( permutationKey ) ) {
		logger.error( `Invalid permutation key: '${ permutationKey }'. Processing of this branch is skipped.` )
		return
	}

	// Missing title?
	if ( ! blockData.title ) {
		blockData.title = permutationKey && ! isPermutationBranch( permutationKey ) ? permutationKey : ''
	}

	// ~ Process blockData properties ~
	for ( const [ key, value ] of Object.entries( blockData ) ) {
		if ( key !== 'variants' ) {
			data = addBlockGeneratorData( key, value, permutationKey, data )
		}
	}

	// ~ Recursively iterate through permutation branches ~
	const { variants } = blockData
	if ( variants ) {
		for ( const [ key, levelData ] of Object.entries( variants ) ) {
			// Each level inherits from its parent, but must not mutate its parent
			const _data = _.cloneDeep( data )
			yield * blockGenerator( fileName, levelData, key, _data )
		}
	}
	// ~ Reached the deepest permutation of this branch ~
	// Process data and generate blocks
	else {
		// !! DOES THIS HAVE TO BE REMOVED?
		// The final permutation cannot be a branch
		// if ( isPermutationBranch( permutationKey ) ) {
		// 	generatorLog.error( `Invalid permutation key: '${ permutationKey }'. The deepest permutation cannot be an anonymous branch. Processing of this branch is skipped.` )
		// 	return
		// }

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
			logger.notice( `Found the 'identifier' property, but this has no effect. Block identifiers are compiled from permutation keys.` )
		}

		// ~ Generate texture/material permutations (variants) ~
		const { geometry, material_instances, materials, texture, textures } = data

		if ( material_instances ) {
			if ( ! geometry ) {
				logger.error( `Found the 'material_instances' property, but missing required property 'geometry'.` )
			}

			if ( texture ) {
				logger.warn( `Found both the 'material_instances' property and 'texture' directive, but these cannot be used together. Ignoring 'texture'.` )
			}

			// !!Validate MIs here

			data.materials = undefined
			data.textures = undefined
		}
		else if ( texture ) {
			if ( ! geometry ) {
				logger.error( `Found the 'texture' directive, but missing required property 'geometry'.` )
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
				logger.warn( `Found the 'materials' directive, but missing required property 'geometry'.` )
			}

			if ( textures ) {
				logger.notice( `Found both the 'materials' directive and the 'textures' directive, but these cannot be used together. Ignoring 'textures'.` )
				data.textures = undefined
			}

			if ( ! Object( materials ) === materials || Array.isArray( materials ) ) {
				logger.error( `The 'materials' directive is not configured correctly, expected an object (key-value pairs enclosed in {}).` )
				data.materials = undefined
			}
		}
		else if ( textures ) {
			if ( ! geometry ) {
				logger.warn( `Found the 'textures' directive, but missing required property 'geometry'.` )
			}

			if ( ! Array.isArray( textures ) && ! textures.length ) {
				logger.error( `The 'textures' directive does not contain a valid array (list enclosed in []).` )
				data.textures = undefined
			}
		}

		// ~ Split streams - with and without texture ~
		if ( ! Object.keys( data.material_instances || {} ).length && ( data.materials || data.textures ) ) {
			// Check the render directive
			if ( data.render ) {
				if ( data.render.texture ) {
					logger.warn( `The 'render' directive contains invalid data: the 'texture' key cannot be used here.` )
					delete data.render.texture
				}

				data.render = prepareMaterialInstance( { ...data.render, texture: 1 }, 'render' )
				delete data.render.texture
			}

			// Process textures and materials
			data = processBlockMaterials( data )

			// Create property permutations (variants) based on materials
			// yield doesn't work with forEach
			for ( const [ key, material ] of Object.entries( data.materialData ) ) {
				let _data = _.cloneDeep( data )
				_data.permutationPath.push( `${ key }` ) // delineate texture from other permutations (variants)
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

function MinecraftPropsParser( block, config, material_instances ) {
	return {
		// https://wiki.bedrock.dev/documentation/creative-categories.html#top
		creative_category( creative_category ) {
			const category = { ...creative_category }
			if ( category.group ){
				if ( category.group.substring( 0, 15 ) === 'itemGroup.name.' ) {
					logger.notice( `Found 'itemGroup.name.' prefix in 'creative_category' property. You can omit this prefix, it is added automatically.` )
				}
				else {
					category.group = `itemGroup.name.${ category.group }`
				}
			}
			block.components.creative_category = category
		},

		events( events ) {
			block.events = events
		},

		geometry( geometry ) {
			let _geometry = geometry
			if ( geometry.substring( 0, 9 ) === 'geometry.' ) {
				logger.notice( `Found 'geometry.' prefix in 'geometry' property. You can omit this prefix, it is added automatically.` )
				_geometry = geometry.slice( 9 )
			}

			const geoPrefix = typeof config.geometryPrefix === 'string' ? config.geometryPrefix : ''
			block.components.geometry = `geometry.${ geoPrefix + _geometry }`
			block.components.material_instances = material_instances
		},

		permutations( permutations ) {
			block.permutations = permutations
		},
	}
}

/**
 * Generate block JSON from generator data. Called for every final permutation.
 *
 * @param data
 * @return {object}
 */
function prepareBlock( data ) {
	const { permutationPath, material_instances } = data
	const { templateData, config } = appData

	const permutationTitle = getPermutationTitle( data )
	let identifier = getPermutationName( data )

	// minecraft:block section, with required subsections
	let block = { components: {}, description: {} }
	block.description.identifier = `${ config.prefix }:${ identifier }`

	// Parse special MC props
	const mcPropsParser = MinecraftPropsParser( block, config, material_instances )
	Object.entries( mcPropsParser ).forEach( ( [ key, fn ] ) => key in data && fn( data[ key ] ) )

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
				logger.error( `The 'materials' directive contains invalid data.`, { key: name, data: materialData } )
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
		logger.error( `The '${ key }' directive or key cannot contain arrays, only strings or objects.`, { value: materialInstance } )
		return {}
	}
	else if ( Object( materialInstance ) !== materialInstance ) {
		logger.error( `The '${ key }' directive or key must contain an object.`, { value: materialInstance } )
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
		logger.error( `The '${ key }' directive or key contains bad data: invalid value for 'render_method' (render_method: ${ render_method })` )
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
		logger.error( `The '${ key }' directive or key contains an invalid material instance: required key 'texture' is missing.` )
		return {}
	}

	// log( { materialInstance } )
	const invalidKeys = removeArrayElements( Object.keys( materialInstance ), [ 'ambient_occlusion', 'face_dimming', 'render_method', 'texture' ] )

	if ( invalidKeys.length ) {
		logger.warn( `The '${ key }' directive or key contains bad material instance data: the key(s) '${ invalidKeys.join( ', ' ) }' are not recognized'.` )
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
		logger.warn( `The '${ key }' directive or key contains a material instance map, but is missing the '*' key (a default material instance).` )
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
			logger.error( `Skipping disabled preset '${ preset }'.` )
			continue
		}

		if ( ! templateData.presets ) {
			logger.error( `Cannot apply preset '${ preset }': no preset file is loaded.` )
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
					logger.error( `Invalid preset variation.`, { preset, variation: presetVariation } )
				}
			}
			else {
				data = addMinecraftProps( data, presets )
			}
		}
		else {
			logger.error( `Invalid preset.`, { preset } )

		}
	}

	return data
}

/**
 * Fill out necessary block definition sections and props.
 */
function addMinecraftProps( block, data, section = 'components' ) {
	const blockSections = [ 'components', 'description', 'events' ] // excl. 'variants'

	if ( section ) {
		block[ section ] = section in block ? block[ section ] : {}
	}

	Object.entries( data ).forEach( ( [ key, el ] ) => {
		// Exclude special keys
		if ( directives.includes( key ) || specialMinecraftProps.includes( key ) || specialProcessingKeys.includes( key ) ) {
			return
		}

		if ( Object( el ) === el ) {
			if ( key === 'variants' ) {
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
					logger.error( `Type mismatch - cannot add data to block. Expected existing data to be array, not ${ typeof objValue }. Object path: ${ key }.${ propName }.` )
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
 * @param {'add', 'mergeArray'|'mergeObject'|'push'|'new-permutation'} method
 */
function addBlockGeneratorData( key, value, permutationKey, data ) {
	const oldType = Object( data[ key ] ) === data[ key ] ? ( Array.isArray( data[ key ] ) ? 'array' : 'object' ) : null
	const newType = Object( value ) === value ? ( Array.isArray( value ) ? 'array' : 'object' ) : null
	const permutationName = getPermutationName( data.permutationPath, '/' )

	const dataAccumulators = {
		mergeArray() {
			if ( newType !== 'array' ) {
				throw new Error( `Unexpected value - expected an array.\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}
			if ( data[ key ] && oldType !== newType ) {
				throw new Error( `Cannot merge data with this property because of type mismatch (existing type: ${ oldType }, new type: ${ newType }).\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}

			data[ key ] = data[ key ] || []
			data[ key ] = arrayDeduplicate( data[ key ], value )
			return data
		},

		mergeObject() {
			if ( newType !== 'object' ) {
				throw new Error( `Unexpected value - expected an object.\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}
			if ( data[ key ] && oldType !== newType ) {
				throw new Error( `Cannot merge data with this property because of type mismatch (existing type: ${ oldType }, new type: ${ newType }).\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}

			data[ key ] = data[ key ] || {}
			data[ key ] = _.merge( data[ key ], value )
			return data
		},

		push() {
			if ( data[ key ] && oldType !== 'array' ) {
				throw new Error( `Cannot push value to this property, not an array.\nPermutation: ${ permutationName }\nKey: ${ key }\n` )
			}
			data[ key ] = data[ key ] || []
			data[ key ].push( value )
			return data
		},

		newPermutation() {
			data.permutationData[ permutationKey ][ key ] = value
			return data
		},
		default() {
			data[ key ] = value
			return data
		},
	}

	// Control how data handled when adding permutations
	// Merge or concatenate
	const accumulatorMap = {
		apply: 'mergeObject',
		materials: 'mergeObject',
		render: 'mergeObject',
		textures: 'mergeArray',
		title: 'newPermutation',
		type: 'newPermutation', // !! ????
	}

	const method = key in accumulatorMap ? accumulatorMap[ key ] : 'default'

	return dataAccumulators[ method ]()
}
