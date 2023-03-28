'use strict'
import _ from 'lodash'
import nodePath from 'path'
import { saveFileAsync } from '../../lib/fs-utils.js'
import appData from '../../app-data.js'
import {
	directivePrefix,
	directives,
	logger,
	minecraftProps,
	staticPropPrefix,
	variantPrefix,
	variablePrefix,
	calculatedPropPrefix,
} from './../generator-config.js'
import { stringHasPrefix, isObj, resolveTemplateStringsRecursively, resolveRefsRecursively } from '../../lib/utils.js'
import { sortProps } from '../builder-utils.js'

/**
 * Generate name from title attribute in nested permutations (variants).
 *
 * @param {JSO} permutationData Block generator data
 */
export function getPermutationTitle( permutationData ) {
	const { titleTemplate } = appData.settings.output
	const buildString = RecursiveTemplateStringBuilder( titleTemplate )

	permutationData
		.filter(
			( permutation ) =>
				permutation.key &&
				! isAnonymousPermutationBranch( permutation.key ),
		)
		.forEach(
			( { title, type } ) => title !== null && buildString.add( title, type ),
		)
	// .forEach( ( permutationName ) => {
	// 	const { title, type } = permutationData.data[ permutationName ]

	// 	// Skip if null
	// 	if ( title === null ) {
	// 		return
	// 	}

	// 	// Use permutation key if undefined
	// 	const _title = title ?? permutationName

	// 	buildString.add( _title, type )
	// } )

	return buildString.get()
}

/**
 * Generate name from nested permutations (variants).
 *
 * @param {string} separator String to separate permutations
 */
export function getPermutationName( permutationData, separator = undefined ) {
	let nameTemplate = {}

	if ( separator ) {
		nameTemplate = {
			default: `sep=<${ separator }>`,
		}
	}
	else {
		nameTemplate = appData.settings.output.nameTemplate ?? {}
	}

	const buildString = RecursiveTemplateStringBuilder( nameTemplate )

	permutationData
		.filter(
			( permutation ) =>
				permutation.key &&
				! isAnonymousPermutationBranch( permutation.key ),
		)
		.forEach( ( { key, type } ) => buildString.add( key, type ) )

	const name = buildString.get()
	return name.toLowerCase()

	// Todo
	// else {
	// 	const { permutationPath, permutationData } = data
	// 	return getPermutationStringFromTemplate( 'name', permutationPath, permutationData, separators.names )
	// }
}

/**
 * Generate path and fileName for behaviour pack block definition.
 *
 * @param {string[]} permutationPath
 */
export function getBlockFileInfo( permutationPath ) {
	const { paths } = appData.generatorData.output
	const { pathSegmentation } = appData.settings.output

	// Create directories for permutation segments?
	// Make copy of permutationPath first
	const permutationArr = [ ...permutationPath ].filter(
		( x ) => x && ! isAnonymousPermutationBranch( x ),
	)

	let _pathSegmentation = Number( pathSegmentation ) || 0
	if ( _pathSegmentation ) {
		if ( permutationArr.length <= _pathSegmentation ) {
			_pathSegmentation = permutationArr.length - 1
		}
	}

	let dirPath, fileName
	if ( _pathSegmentation ) {
		dirPath = permutationArr.slice( 0, _pathSegmentation )
		fileName = permutationArr.slice( _pathSegmentation ).join( '_' )
	}
	else {
		dirPath = []
		fileName = permutationArr.join( '_' )
	}

	fileName = `${ fileName }.json`

	const blocksPath = nodePath.join( paths.BP, 'blocks/hubgen' )
	const fileInfo = {
		fileName,
		relPath: nodePath.join( ...dirPath, fileName ),
		path: nodePath.join( blocksPath, ...dirPath ),
	}
	// fileInfo.dynamicFileName = nodePath.join( ...dirPath, fileInfo.fileName )
	return fileInfo
}

/**
 * Validate permutation name.
 *
 * @param {string} name
 */
export function validatePermutationName( name ) {
	const rxValidName = /[a-z][a-z0-9_\-.()]*/i
	return rxValidName.test( name )
}

/**
 * Check permutation segment name to check if it's an anonymous branch.
 *
 * @param {string} name
 */
export function isAnonymousPermutationBranch( name ) {
	const rxAnonymous = /[-]+/
	return rxAnonymous.test( name )
}

function RecursiveTemplateStringBuilder( template ) {
	const groupTemplate = {
		name: '',
		after: '',
		before: '',
		sep: '',
		template: '',
		data: undefined,
	}

	const data = {
		group: undefined,
		result: [],

		newGroup( key ) {
			if ( this.group ) {
				this.endGroup()
			}
			this.group = { ...groupTemplate }
			this.group.name = key
			this.group.data = []
		},

		endGroup() {
			// Finalize current group
			const { data: gData, sep, after, before } = this.group
			const result = [
				before,
				gData.length ? gData.join( sep ?? '_' ) : undefined,
				after,
			]
			const r = result.filter( ( x ) => ! [ undefined, null, '' ].includes( x ) )

			if ( r.length ) {
				this.result.push( r.join( '' ) )
			}

			this.group = undefined
		},

		setGroupConfig( config ) {
			const [ cmd, rawCmdArg ] = config.split( '=' )
			let cmdArg = [ ...rawCmdArg.matchAll( /<([^>]+)>/g ) ]
			cmdArg = cmdArg.flat()[ 1 ];
			[ 'after', 'before', 'sep', 'template' ].forEach( ( c ) => {
				if ( cmd === c ) {
					data.group[ c ] = cmdArg
				}
			} )
		},

		addValue( value ) {
			if ( data.group.template ) {
				value = data.group.template.replace( /%s/gi, value )
			}

			this.group.data.push( value )
		},
	}

	return {
		add( value, type = undefined ) {
			const templateEl = template[ type ?? 'default' ]

			if ( ! templateEl ) {
				return
			}

			// Object.entries( template ).map( ( [ key, templateEl ] ) => {
			templateEl.split( ';' ).map( ( config ) => {
				if ( ! data.group || data.group.name !== type ) {
					data.newGroup( type )
				}

				data.setGroupConfig( config )
			} )
			// } )

			data.addValue( value )
		},
		get() {
			data.endGroup()
			return data.result.join( '' )
		},
	}
}

export function filterEmptyChildCollections( obj, mutateSource = false ) {
	const target = mutateSource ? obj : {}

	return Object.entries( obj ).reduce( ( result, [ key, value ] ) => {
		if ( Object( value ) !== value ) {
			if ( ! mutateSource ) {
				result[ key ] = value
			}
			return result
		}

		const _value = Array.isArray( value ) ? value : Object.keys( value )

		if ( ! _value.length ) {
			if ( key in result ) {
				delete result[ key ]
			}
		}
		else if ( ! mutateSource ) {
			result[ key ] = value
		}

		return result
	}, target )
}

export function comparePrevNewType( prevVal, newVal ) {
	const oldType =
		Object( prevVal ) === prevVal
			? Array.isArray( prevVal )
				? 'array'
				: 'object'
			: null

	const newType =
		Object( newVal ) === newVal
			? Array.isArray( newVal )
				? 'array'
				: 'object'
			: null

	return {
		oldType,
		newType,
		typesMatch: oldType === newType,
	}
}

export function removeMcPrefix( props ) {
	if ( Array.isArray( props ) ) {
		return props.map( removeMcPrefix )
	}
	if ( Object( props ) !== props ) {
		return props
	}

	return Object.entries( props ).reduce( ( result, [ key, value ] ) => {
		const _key = stringHasPrefix( 'minecraft:', key ) ? key.slice( 10 ) : key

		result[ _key ] = Object( value ) === value ? removeMcPrefix( value ) : value

		return result
	}, {} )
}

/**
 * Replace all placeholders with variables or template strings.
 *
 * Built-in variables: prefix, permutation
 *
 * param {CreateBlockData} blockData
 */
export function replaceValues( vars, ...target ) {
	// const { props, source, extraVars } = blockData

	const brackets = [ '{{', '}}' ]

	target.forEach( ( obj ) => {
		resolveTemplateStringsRecursively(
			obj,
			vars,
			{
				brackets,
				restrictChars: false,
				mutateSource: true,
			},
		)

		resolveRefsRecursively( obj, vars, { removeMissing: false, mutateSource: true, resolveNestedVars: false } )
	} )

	return target
}
