'use strict'
import nodePath from 'path'
import { pathToFileURL } from 'url'

import {
	arrayMerge,
	extractArrayElements,
	log,
} from '../../lib/utils.js'
import {
	eraseDirContentsAsync, readDirAsync, pathExists, isInsideCwd } from '../../lib/fs-utils.js'
import {
	generatorPaths,
	logger,
} from '../generator-config.js'
import appData, { initAppData } from '../../app-data.js'
import display from '../../lib/display.js'
import { loadJsonFiles } from '../../lib/json-utils.js'

export function loadBlockTemplate( file ) {
	const fileName = nodePath.basename( file )

	log( )
	display.section( fileName )
	logger.setSection( fileName )

	try {
		const blockData = loadJsonFiles( file, true )

		if ( ! blockData ) {
			display.error( 'Unable to read or parse JSON file.', file )
			logger.error( 'Template file could not be read/parsed.', file )
			return
		}

		return { fileName, blockData }
	}
	catch ( error ) {
		display.error( `Unable to read or parse file.`, file )
		logger.error( `Unable to read or parse file.`, error.message )
	}
}

/**
 *
 * @param {JSO<string>} files
 * @return {Promise<JSO<Function>>}
 */
export async function loadTemplateScripts( files ) {
	const templateScripts = await Object.entries( files ).reduce( async( result, [ key, file ] ) => {
		const _result = await result
		_result[ key ] = await loadScript( key, file )
		return result
	}, {} )
	return templateScripts
}

export async function loadBlockTemplateFiles( blocks ) {
	const { blockConfigPath } = appData.generatorData.input
	const { basePath, outputDir } = appData.generatorData.output

	if ( ! pathExists( blockConfigPath ) ) {
		display.error( `The block config dir does not exist! (path: ${ blockConfigPath })` )
		return
	}

	// Constraint: all block template files must begin with 'blocks-'
	// const fnErrors = blocks.filter( ( file ) => {
	// 	const fileName = nodePath.basename( file )
	// 	if ( fileName.substring( 0, 7 ) !== 'blocks-' ) {
	// 		return true
	// 	}
	// 	return false
	// } )

	// if ( fnErrors.length ) {
	// 	display.error( `One or more block template files are invalid!\n\nFile names for block templates must begin with 'blocks-'.` )
	// 	log( '\nInvalid files names:' )
	// 	fnErrors.forEach( ( x ) => log( nodePath.relative( '.', blockConfigPath, x ) ) )
	// 	return
	// }

	const _blocks = [ ...[ blocks ].flat() ]

	let blockFiles = []
	if ( _blocks.length ) {
		// Go through each array element
		const files = await _blocks.reduce( async( result, el ) => {
			result = await result
			const _files = await readDirAsync( blockConfigPath, false, el )
			result.push( ..._files )
			return result
		}, [] )

		blockFiles = arrayMerge( files )
	}

	else {
		display.error( 'Nothing to process!\nNo (valid) block template files configured in config.js or specified in command line arguments.' )
		return
	}

	if ( ! blockFiles.length ) {
		logger.warn( `No block template files found!\nCheck the configuration (block filter and directory) in config.js or specify with command line arguments.\n\nBlock directory: ${ blockConfigPath }\nBlock filter: ${ _blocks.join( ',' ) }` )
		// log( '\nBlock filter:', _blocks )
		// log( 'Block directory:', blockConfigPath )
		// log()
		return
	}

	const inputEqualsOutput = blockFiles
		.map( ( x ) => nodePath.relative( basePath, nodePath.dirname( x ) ) )
		.some( ( x ) => ! x )

	if ( inputEqualsOutput ) {
		display.error( `One or more input files exist in the specified output directory (${ outputDir }). \nProgram stopped.` )
		return
	}

	return blockFiles
}

export function loadJson( loadFiles ) {
	const { rootPath } = appData.paths

	const jsonFiles = Object.entries( loadFiles ).reduce( ( result, [ key, file ] ) => {
		if ( ! file ) {
			return result
		}
		if ( pathExists( file ) ) {
			result[ key ] = file
		}
		else {
			display.error( `Couldn't find input file '${ nodePath.relative( rootPath, file ) }' ('config.input.${ key }').\n` )
			logger.setSection( 'config' )
			// !! not working>>>
			// logger.setLabel( `config.input.${ key }` )
			logger.error( `Couldn't find input file '${ nodePath.relative( rootPath, file ) }' ('config.input.${ key }').\n` )
		}
		return result
	}, {} )

	try {
		if ( Object.keys( jsonFiles ).length ) {
			return loadJsonFiles( jsonFiles, false )
		}
	}
	catch ( error ) {
		display.error( 'Failed to read/parse JSON template file(s).' )
		logger.error( error.message )
	}
}

/**
 *
 * @param {string} key
 * @param {string} file
 * @return {Promise<Function>}
 */
async function loadScript( key, file ) {
	if ( pathExists( file ) ) {
		const scriptData = await import( pathToFileURL( file ).href )
		return 'default' in scriptData ? scriptData.default : scriptData
	}
	else if ( file ) {
		display.error( `Couldn't find input script '${ file }' ('config.input.${ key }').\n` )
	}
}
