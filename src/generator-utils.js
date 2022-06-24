import nodePath from 'path'
import { saveFileAsync } from './lib/fs-utils.js'
import appData from './app-data.js'

// saveBlockToJson, getBlockFileInfo, getPermutationTitle, getPermutationName, getPermutationStringFromTemplate, validatePermutationName, isPermutationBranch

/**
 * Save block JSON to disk.
 *
 * @param {string[]} componentPath
 * @param {Object<string, any>} data
 */
export function saveBlockToJson( identifier, fileInfo, data ) {
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
export function getBlockFileInfo( permutationPath, outputDir, pathSegmentation ) {
	// const { outputDir } = appData
	// const { pathSegmentation } = appData.config.output

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

	fileName = `${ fileName }.json`
	const blockDir = nodePath.join( outputDir, 'BP', 'blocks' )
	const fileInfo = {}
	fileInfo.fileName = fileName
	// fileInfo.nodePath = nodePath.resolve( '.' )
	// fileInfo.blockDir = blockDir
	// fileInfo.outputPath = nodePath.resolve( '.', outputDir )
	fileInfo.dynamicFileName = nodePath.join( ...dirPath, fileInfo.fileName )
	fileInfo.fullPath = nodePath.resolve( '.', blockDir, ...dirPath )
	// fileInfo.fullName = nodePath.resolve( fileInfo.fullPath, fileInfo.fileName )

	return fileInfo
}

/**
 * Generate name from nested permutations (variants).
 *
 * @param {object} data Block generator data
 * @param {string} separator String to separate permutations
 */
export function getPermutationName( data, separator = undefined ) {
	const { separators } = appData

	if ( Array.isArray( data ) ) {
		separator = separator || separators.names[ '*' ]
		return data
			.filter( ( permutation ) => permutation && ! isPermutationBranch( permutation ) )
			.join( separator )
	}
	else {
		const { permutationPath, permutationData } = data
		return getPermutationStringFromTemplate( 'name', permutationPath, permutationData, separators.names )
	}
}

/**
 * Generate name from title attribute in nested permutations (variants).
 *
 * @param {object} data Block generator data
 */
export function getPermutationTitle( data ) {
	const { separators } = appData
	const { permutationPath, permutationData } = data
	return getPermutationStringFromTemplate( 'title', permutationPath, permutationData, separators.titles )
}

/**
 * Process permutation name according to template.
 *
 * @param {string} whichString
 * @param {*} permutations
 * @param {*} permutationData
 * @param {*} separators
 */
export function getPermutationStringFromTemplate( whichString, permutations, permutationData, separators ) {
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
export function validatePermutationName( name ) {
	const rxValidName = /[a-z][a-z0-9_\-.()]*/i
	return rxValidName.test( name )
}

/**
 * Check permutation segment name to check if it's an anonymous branch.
 *
 * @param {string} name
 */
export function isPermutationBranch( name ) {
	const rxAnonymous = /[-]+/
	return rxAnonymous.test( name )
}
