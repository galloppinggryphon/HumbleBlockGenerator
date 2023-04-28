import _ from 'lodash'
import { resolveTemplateStringsRecursively } from '../../lib/utils.js'
import {
	filterObjByKeys,
	filterPropsByKeyPrefix,
	mergeProps,
} from '../builder-utils.js'
import appData from '../../app-data.js'

/**
 * Generate new models from combinations of bones.
 *
 * @param {ModelConfig.GeneratorProps} props
 */
export function * ModelGenerator( { modelData, templates, data = undefined } ) {
	// log( chalk.bgCyan( '++++++++++ ModelGenerator ++++++++++++\n' ), { modelData, data } )

	if ( Object( modelData ) !== modelData ) {
		throw new Error( 'INVALID MODEL DATA!' )
	}

	data = data ?? { bones: [], name: [] }

	if ( ! Array.isArray( modelData ) ) {
		if ( modelData[ '@template' ] ) {
			applyModelTemplate( { key: modelData[ '@template' ], modelData, templates } )
		}
		else if ( modelData[ '@variants' ] ) {
			// TODO?
		}

		const modelEntries = Object.entries( modelData ).filter( ( [ key, template ] ) => (
			key === '*'
				? ( data.bones.push( ...[ template ].flat() ), false )
				: true
		) )

		for ( const [ key, template ] of modelEntries ) {
			const _data = _.cloneDeep( data )
			_data.name.push( key )
			const _models = typeof template === 'string'
				? [ template ].flat()
				: template
			yield * ModelGenerator( { templates, modelData: _models, data: _data } )
		}
		return
	}

	yield {
		modelName: data.name.join( '' ),
		bones: [ ...data.bones, ...modelData ],
	}
}

/**
 * Model parser factory. Returns function that combines bones into a new model.
 *
 * @param {JSO} modelData
 * @param {string} rootName
 * @return { ( modelName: string, bones: string[] ) => JSO }
 */
export function ModelFactory( modelData, rootName ) {
	const data = {
		modelBones: {},
		bones: {},
		model: {},
	}

	// Parse file - extract scaffolding, identify bones and parent bones
	data.bones = modelData[ 'minecraft:geometry' ][ 0 ].bones

	return ( modelName, bones ) => {
		data.modelBones = {}
		bones.forEach( ( boneName ) => {
			const newBones = getBone( boneName )
			Object.assign( data.modelBones, newBones )
		} )

		/** @type {JSO} */
		const modelJson = _.cloneDeep( modelData )
		const geometry = modelJson[ 'minecraft:geometry' ][ 0 ]

		geometry.description.identifier = createModelName( rootName, modelName )
		geometry.bones = Object.values( data.modelBones )
		modelJson[ 'minecraft:geometry' ][ 0 ] = geometry

		return modelJson
	}

	/**
	 * @param {string} boneName
	 * @param {boolean} getChildren
	 */
	function getBone( boneName, getChildren = false ) {
		// log( 'getBone', data )
		const bone = data.bones.find( ( current ) => current.name === boneName )

		if ( ! bone ) {
			const boneList = ( Object( boneName ) === boneName ) ? JSON.stringify( boneName ) : boneName
			throw new Error( `Bone not found: '${ boneList }!' Parent model: '${ rootName }'.` )
		}

		const bones = { [ boneName ]: bone }

		// Get parent if specified
		const { parent, cubes } = bone
		if ( parent && ! ( parent in data.modelBones ) ) {
			Object.assign( bones, getBone( parent ) )
		}
		// If no cubes, this is a parent, so grab all children
		else if ( getChildren && ! cubes ) {
			const _bones = data.bones.filter( ( current ) => current.parent === bone.name )
			_bones.reduce( ( result, current ) => {
				result[ current.name ] = current
			}, bones )
		}
		return bones
	}
}

/**
 * @param {string} rootName
 * @param {string} [modelName]
 */
export function createModelName( rootName, modelName = '' ) {
	const { geometryPrefix } = appData.settings
	return `geometry.${ geometryPrefix }${ rootName }${ modelName }`
}

/**
 * @param {{ key: string, modelData: JSO, templates: JSO }} props
 */
function applyModelTemplate( { key, modelData, templates } ) {
	const template = templates[ key ]
	if ( ! template ) {
		throw new Error( `Template not found: ${ key }!` )
	}

	delete modelData[ '@template' ]

	const vars = filterPropsByKeyPrefix( modelData, '$' )
	const permutationVars = filterPropsByKeyPrefix( modelData, '@' )
	const permutationKeys = Object.keys( permutationVars )

	if ( permutationKeys.length > 1 ) {
		throw new Error( 'Too many permutation keys defined - there can only be one!' )
	}

	filterObjByKeys( modelData, [ ...permutationKeys, ...Object.keys( vars ) ] )

	const permutationKey = permutationKeys[ 0 ]

	/**
	 * @type {JSO}
	 */
	const permutations = permutationVars[ permutationKey ] ? permutationVars[ permutationKey ] : { '': null }

	/**
	 * @type {JSO}
	 */
	const _template = _.cloneDeep( template )

	if ( Object.keys( vars ).length ) {
		resolveTemplateStringsRecursively( _template, vars, { restrictChars: false, mutateSource: true } )
	}

	for ( const [ modelKey, modelValue ] of Object.entries( modelData ) ) {
		if ( Array.isArray( modelValue ) ) {
			modelData[ modelKey ] = {
				'': modelValue,
			}
		}
	}

	/**
	 * @type {JSO}
	 */
	const templateData = Object.entries( permutations ).reduce( ( result, [ modelPermutation, value ] ) => {
		const permutationData = _.cloneDeep( _template )

		if ( value === null ) {
			Object.assign( result, permutationData )
		}
		else {
			resolveTemplateStringsRecursively( permutationData, { [ permutationKey ]: value }, { restrictChars: false, mutateSource: true } )
			result[ modelPermutation ] = Object.assign( {}, result[ modelPermutation ], permutationData ) // permutationData
		}

		return result
	}, {} )

	mergeProps( modelData, templateData )
}
