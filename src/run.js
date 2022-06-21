'use strict'
import fs, { promises as fsAsync } from 'fs'
import nodePath from 'path'
import { arrayDeduplicate, extractArrayElements, log } from './lib/utils.js'
import { eraseDirContentsAsync, loadJsonFiles, readDirAsync, pathExists, isInsideCwd } from './lib/fs-utils.js'
import { getScriptArgs } from './lib/get-args.js'
import { blockBuilder } from './block-builder.js'
import { runSync } from './sync.js'

const appData = {
	scriptArgs: {},
	config: {},
	outputPath: undefined,
	outputDir: undefined,
	blockInput: [],
	templateData: {},
}

async function main() {
	if ( ! fs.existsSync( nodePath.resolve( '.', 'node_modules' ) ) ){
		log( `\n🟠 Humble Block Generator has not been installed yet!\n\nRun 'npm install' first.` )
		return
	}

	const _scriptArgs = getScriptArgs()
	const { build, init, sync, ...scriptArgs } = _scriptArgs
	appData.scriptArgs = scriptArgs

	printHeader()

	if ( init ) {
		initalize()
		return
	}

	if ( ! fs.existsSync( nodePath.resolve( '.', 'config.js' ) ) ) {
		log( `\n⛔ FATAL ERROR: 'config.js' not found!\n\nRun 'npm run init' to create.` )
		return
	}

	const { default: config } = await import( '../config.js' )
	appData.config = config

	if ( ! parseInput() ) {
		return
	}

	if ( build ) {
		runBlockGenerator()
		return
	}

	if ( sync ) {
		runSync( appData )
		return
	}

	if ( scriptArgs && Object.keys( scriptArgs ).length ) {
		log( '\n⛔ ERROR! Invalid script argument(s): ', scriptArgs.join( ', ' ), '\n' )
	}

	showHelp()
}

async function initalize() {
	const sourceFolder = 'examples'
	const destinationFolder = 'config'
	const initFiles = {
		'config.js': 'config.js',
		'scaffolding.json': 'scaffolding.json',
		'blocks-vslab.json': 'blocks-vslab.json',
		'presets.json': 'presets.json',
	}

	log( '\n▒▒▒▒▒▒▒▒▒▒▒▒▒▒  🚩 Initializing Humble Block Generator 🚩  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒' )
	log( '\nCreating default configuration files:\n' )

	if ( ! pathExists( sourceFolder ) ) {
		log( `⛔ FATAL ERROR: Configuration template folder (${ sourceFolder }) is missing!` )
		log( 'If this error is occurring during the initial installation of HUB, try again.' )
		log( `If this error occurred during a re-initialization, run 'npm install' to redownload the missing files.` )
		complete( false )
		return
	}

	const result = await initializeFiles( Object.entries( initFiles ) )
	complete( result )

	function complete( success ){
		log( '\n' )
		log( '┌────────────────────────────────────────┐' )
		log( '│                                        │' )

		if ( success ) {
			log( '│   🏆 HUB installed and initialized!    │' )
			log( `│   🛵 To continue, run ▶ 'npm start'.   │` )
		}
		else {
			log( '│   ⛔ INSTALL FAILED!                    │' )
		}
		log( '│                                        │' )
		log( '└────────────────────────────────────────┘' )

		log( '\nNPM install report below ↴ ↴ ↴\n' )
	}

	async function initializeFiles( files ) {
		if ( ! files || ! files.length ) {
			return
		}

		const [ destinationFile, sourceFile ] = files.shift()
		const source = nodePath.resolve( '.', sourceFolder, sourceFile )
		const destination = destinationFile === 'config.js'
			? nodePath.resolve( '.', destinationFile )
			: nodePath.resolve( '.', destinationFolder, destinationFile )

		if ( pathExists( destination ) ) {
			log( `${ sourceFile }   [🟡 SKIPPED]   File already exists` )
		}
		else if ( ! pathExists( source ) ) {
			log( `${ sourceFile }   [❌ ERROR]   Cannot find source` )
		}
		else {
			let fsOpResult
			try {
				fsOpResult = await fsAsync.mkdir( nodePath.dirname( destination ), { recursive: true } )
				fsOpResult = await fsAsync.copyFile( source, destination )
			}
			catch ( err ) {
				log( 'A failure occurred while copying files.\n\nError details:' )
				log( err.message )
				return false
			}

			if ( fsOpResult ) {
				log( `${ sourceFile }   [❌ ERROR]   Unknown error ==> `, fsOpResult )
			}
			else {
				log( `${ sourceFile }   [🟢 SUCCESS]   File created` )
			}
		}

		await initializeFiles( files )
		return true
	}
}

async function runBlockGenerator( ) {
	const { scriptArgs, config, outputPath } = appData
	const { blocks, outputDir, ...rest } = scriptArgs

	if ( rest && Object.keys( rest ).length ) {
		console.error( '⛔ Error! Invalid script argument(s):\n', rest, '\n\n' )
		return
	}

	appData.templateData = await getTemplateData()

	if ( ! Object.keys( appData.templateData ).length ) {
		return
	}

	appData.blockInput = await getBlockTemplates()

	if ( ! appData.blockInput.length ) {
		return
	}

	log( '\n📁 Output folder:\n  ', outputPath )

	try {
		const { allowOutputOutsideCwd } = config.output

		if ( ! allowOutputOutsideCwd && ! isInsideCwd( outputPath ) ) {
			throw new Error( `Cannot use directory '${ outputPath }': not allowed outside the current working directory or its descendants..` )
		}

		await eraseDirContentsAsync( outputPath )
		blockBuilder( appData )
	}
	catch ( e ) {
		console.error( '\n⛔ Uh oh, errors occurred while generating blocks.\n' )
		console.error( e )
	}
}

function parseInput( ) {
	const { config, scriptArgs } = appData
	const { output } = config

	if ( ! scriptArgs.outputDir && ! output.outputDir ) {
		console.error( 'Error: No output directory is configured!\n\nUse config.js to define a directory or specify with argument.' )
		return
	}

	appData.outputDir = scriptArgs.outputDir ? scriptArgs.outputDir : output.outputDir

	if ( typeof appData.outputDir !== 'string' ) {
		console.error( `\nError: output directory must be a string!\n\nConfigured or supplied output directory: ${ typeof appData.outputDir }).` )
		return
	}

	appData.outputPath = nodePath.resolve( appData.outputDir )
	return !! appData.outputPath
}

export async function getTemplateData( ) {
	const { config } = appData

	if ( ! config.output ) {
		config.output = {}
	}
	if ( ! config.input ) {
		config.input = {}
	}

	const { input = {} } = config
	const { blockConfigDir = '' } = input

	let templateData = {}

	// Load universal JSON template files
	const loadFiles = {
		presets: input.presets,
		scaffolding: input.scaffolding,
	}
	const jsonFiles = {}

	Object.entries( loadFiles ).forEach( ( [ key, file ] ) => {
		const _file = nodePath.join( blockConfigDir, file )

		// log( { _file, blockConfigDir } )

		if ( ! _file ) {
			return
		}
		if ( pathExists( _file ) ) {
			jsonFiles[ key ] = _file
		}
		else {
			console.error( `Error: Couldn't find input file '${ nodePath.relative( '.', _file ) }' ('config.input.${ key }').\n` )
		}
	} )

	try {
		if ( Object.keys( jsonFiles ).length ) {
			templateData = loadJsonFiles( jsonFiles, true )
		}
	}
	catch ( error ) {
		console.error( 'Fatal error: Problems occurred while loading template files.' )
		log( '\nError details:\n', error )
		return
	}

	return templateData
}

async function getBlockTemplates() {
	const { scriptArgs, config, outputPath, outputDir } = appData
	const { input = {} } = config
	const { blockConfigDir = '' } = input

	let blocks
	if ( scriptArgs.blocks && scriptArgs.blocks.length ) {
		blocks = scriptArgs.blocks
	}
	else if ( input.blocks ) {
		blocks = input.blocks

		// Constraint: all block template files must begin with 'blocks-'
		const fnErrors = blocks.filter( ( file ) => {
			const fileName = nodePath.basename( file )
			if ( fileName.substring( 0, 7 ) !== 'blocks-' ) {
				return true
			}
			return false
		} )

		if ( fnErrors.length ) {
			console.error( `Error! One or more block template files are invalid!\n\nFile names for block templates must begin with 'blocks-'.` )
			log( '\nInvalid files names:' )
			fnErrors.forEach( ( x ) => log( nodePath.relative( '.', blockConfigDir, x ) ) )
			return
		}
	}

	if ( blocks ) {
		blocks = [ blocks ].flat()
		const tmpBlocks = [ ...blocks ]
		const wildcardElements = extractArrayElements( tmpBlocks, ( value ) => value && value.indexOf( '*' ) >= 0 )

		const foundTemplates = await wildcardElements.reduce( async ( _fileNames, el ) => {
			_fileNames = await _fileNames
			const files = await readDirAsync( nodePath.join( '.', blockConfigDir ), false, el )
			_fileNames = _fileNames.concat( files )
			return _fileNames
		}, [] )

		const blockFiles = tmpBlocks.map( ( x ) => nodePath.resolve( x ) )

		blocks = foundTemplates.length
			? arrayDeduplicate( blockFiles, foundTemplates )
			: blockFiles
	}
	else {
		console.error( 'Error: Nothing to process!\n\nNo block template files configured in config.js or specified in arguments.' )
		return
	}

	if ( ! blocks || ! blocks.length ) {
		console.error( 'Error: No block template files found!\n\nCheck the configuration in config.js or specify with arguments.' )
		log( '\nThe following files or wildcards were not found:' )
		log( blocks.join( ', ' ) )
		return
	}

	const inputEqualsOutput = blocks
		.map( ( x ) => nodePath.relative( outputPath, nodePath.dirname( x ) ) )
		.some( ( x ) => ! x )

	if ( inputEqualsOutput ) {
		console.error( `\nFatal error: one or more input files exist in the specified output directory (${ outputDir }). \nProgram stopped.` )
		return
	}

	return blocks
}

function showHelp() {
	log( '\nUSAGE' )
	log( 'npm start\t\t   :: Show help' )
	log( 'npm run build\t\t   :: Generate blocks' )
	log( 'npm run build [arguments]  :: Advanced syntax (see below)' )
	log( 'npm run init\t\t   :: Regenerate initial configuration files' )

	log( '\nADVANCED USAGE' )
	log( 'npm run build [blocks:file.json,[...]] [outputDir:relative/output/path]' )
	log( '\nArguments: ' )
	log( 'blocks\t\t:: Specify block template files' )
	log( 'outputDir\t:: Write output to a different folder, relative to root' )
	log( '\nPath names containing spaces must be quoted.' )
	log( '\nFor more information, see readme.md.' )
}

function printHeader() {
	log( '🔳  🔳  Humble' )
	log( '🔳🔳🔳  Block' )
	log( '🔳  🔳  Generator\n' )
}

main()
