'use strict'
const path = require( 'path' )
const { arrayDeduplicate, extractArrayElements, log } = require( './utils' )
const { eraseDirContentsAsync, loadJsonFiles, readDirAsync, pathExists } = require( './fs-utils.js' )
const { blockBuilder } = require( './block-builder' )

async function main( config, scriptArgs ) {
	if ( ! config.output ) {
		config.output = {}
	}
	if ( ! config.input ) {
		config.input = {}
	}

	const { input = {}, output = {} } = config
	//const { blockConfigDir = '' } = input

	let templateData = {}

	// Load universal JSON template files
	const loadFiles = { presets: input.presets, scaffolding: input.scaffolding }
	const jsonFiles = {}

	Object.entries( loadFiles ).forEach( ( [ key, file ] ) => {
		const _file = file // path.join( blockConfigDir, file )

		if ( ! _file ) {
			return
		}
		if ( pathExists( _file ) ) {
			jsonFiles[ key ] = _file
		}
		else {
			console.error( `Error: Couldn't find input file '${ path.relative( '.', _file ) }' ('config.input.${ key }').\n` )
		}
	} )

	try {
		if ( Object.keys( jsonFiles ).length ) {
			templateData = loadJsonFiles( jsonFiles, true )
		}
	}
	catch ( error ) {
		console.error( 'Fatal error: Problems occurred while loading settings.' )
		console.error( '\nError details:\n', error )
		log( '\nProgram stopped.' )
		return
	}
	let blocks
	if ( scriptArgs.blocks && scriptArgs.blocks.length ) {
		blocks = scriptArgs.blocks
	}
	else if ( input.blocks ) {
		blocks = input.blocks

		// Constraint: all block template files must begin with 'blocks-'
		const fnErrors = blocks.filter( ( file ) => {
			const fileName = path.basename( file )
			if ( fileName.substring( 0, 7 ) !== 'blocks-' ) {
				return true
			}
			return false
		} )

		if ( fnErrors.length ) {
			log( `Error! One or more block template files are invalid!\n\nFile names for block templates must begin with 'blocks-'.` )
			log( '\nInvalid files names:' )
			fnErrors.forEach( ( x ) => log( path.relative( '.', x ) ) )
			return
		}
	}

	if ( blocks ) {
		blocks = Array.isArray( blocks ) ? blocks : [ blocks ]

		blocks = blocks.reduce( ( _blocks, block ) => {
			if ( typeof x === 'number' ) {
				_blocks.push( block.toString() )
			}
			else {
				const splitBlocks = block.split( ',' )
				if ( splitBlocks.length ) {
					_blocks.push( ...splitBlocks )
				}
				else {
					_blocks.push( block )
				}
			}
			return _blocks
		}, [] )

		const tmpBlocks = [ ...blocks ]

		const wildcardElements = extractArrayElements( tmpBlocks, ( value ) => value && value.indexOf( '*' ) >= 0 )

		const wildcardFileNames = await wildcardElements.reduce( async ( _fileNames, el ) => {
			_fileNames = await _fileNames
			const files = await readDirAsync( '.', false, el )
			_fileNames = _fileNames.concat( files )
			return _fileNames
		}, [] )

		const blockFiles = tmpBlocks.map( ( x ) => path.resolve( x ) )

		input.blocks = wildcardFileNames.length
			? arrayDeduplicate( blockFiles, wildcardFileNames )
			: blockFiles
	}
	else {
		console.error( 'Error: Nothing to process!\n\nNo block template files configured in config.js or specified in arguments.' )
		return
	}

	if ( ! input.blocks || ! input.blocks.length ) {
		console.error( 'Error: No block template files found!\n\nCheck the configuration in config.js or specify with arguments.' )
		log( '\nThe following files or wildcards were not found:' )
		log( blocks.join( ', ' ) )
		return
	}

	if ( ! scriptArgs.outputDir && ! output.outputDir ) {
		console.error( 'Error: No output directory is configured!\n\nUse config.js to define a directory or specify with argument.' )
		return
	}

	output.outputDir = scriptArgs.outputDir ? scriptArgs.outputDir : output.outputDir

	if ( typeof output.outputDir !== 'string' ) {
		console.error( `\nError: output directory must be a string!\n\nConfigured or supplied output directory: ${ typeof output.outputDir }).` )
		return
	}

	output.outputPath = path.resolve( output.outputDir )

	const inputEqualsOutput = input.blocks
		.map( ( x ) => path.relative( output.outputPath, path.dirname( x ) ) )
		.some( ( x ) => ! x )

	if ( inputEqualsOutput ) {
		console.error( `\nFatal error: one or more input files exist in the specified output directory (${ output.outputDir }). \nProgram stopped.` )
		return
	}

	config.input = input
	config.output = output

	log( '\nOutput folder:', output.outputPath )

	runBlockGenerator( config, templateData )
}

async function runBlockGenerator( config, templateData ) {
	try {
		await eraseDirContentsAsync( config.output.outputPath )
		blockBuilder( config, templateData )
	}
	catch ( e ) {
		console.error( '\nErrors occurred during execution.\n' )
		console.error( e )
	}
}

exports.main = main
