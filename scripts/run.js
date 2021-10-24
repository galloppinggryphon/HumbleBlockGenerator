'use strict'
const { getArgs, log, removeArrayElements } = require( './utils' )
const fs = require( 'fs' )
const fsAsync = fs.promises
const nodePath = require( 'path' )

let scriptArgs
try {
	scriptArgs = getArgs()
}
catch ( error ) {
	console.error( error.message )
	return
}

const mode = scriptArgs ?
	( scriptArgs.build && 'build' )
	|| ( scriptArgs.init && 'init' )
	: undefined

const _scriptArgs = removeArrayElements( Object.keys( scriptArgs ), [ 'build', 'init' ] )

header()

if ( ! fs.existsSync( nodePath.resolve( '.', 'node_modules' ) ) ){
	log( `\nHumble Block Generator has not been installed yet!\n\nRun 'npm install' first.` )
}
else if ( mode === 'init' ) {
	init()
}
else if ( ! fs.existsSync( nodePath.resolve( '.', 'config.js' ) ) ) {
	log( `\nFatal error: config.js not found!\n\nRun 'npm run init' to create.` )
}
else if ( mode === 'build' ) {
	const buildArgs = removeArrayElements( Object.keys( scriptArgs ), [ 'build', 'blocks', 'output' ] )

	if ( buildArgs && buildArgs.length ) {
		log( 'Error! Invalid script argument(s):', buildArgs.join( ', ' ) )
	}
	else {
		const { config } = require( '../config' )
		const { main } = require( './main' )
		main( config, scriptArgs )
	}
}
else if ( _scriptArgs && _scriptArgs.length ) {
	log( 'Error! Invalid script argument(s): ', _scriptArgs.join( ', ' ) )
}
else {
	help()
}

async function init() {
	const sourceFolder = 'examples'
	const destinationFolder = 'config'
	const initFiles = {
		'config.js': 'config.js',
		'scaffolding.json': 'scaffolding.json',
		'blocks-vslab.json': 'blocks-vslab.json',
		'presets.json': 'presets.json',
	}

	log( '\n--- Initializing Humble Block Generator ---' )
	log( '\nCreating default configuration files:\n' )

	if ( ! pathExists( sourceFolder ) ) {
		log( `[ERROR] Configuration template folder (${ sourceFolder }) is missing!` )
		log( 'If this error is occurring during the initial installation of HUB, try again.' )
		log( `If this error occurred during a re-initialization, run 'npm install' to redownload the missing files.` )
		complete( false )
		return
	}

	const result = await initializeFiles( Object.entries( initFiles ) )
	complete( result )

	function complete( success ){
		log( '\n\n----------------------------------------------' )

		if ( success ) {
			log( 'Init complete!' )
			log( `\nTo continue, run 'npm start'.` )
		}
		else {
			log( 'Init failed!' )
		}
		log( '---------------------------------------------\n\n' )
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
			log( `${ sourceFile } [FAILURE] File already exists` )
		}
		else if ( ! pathExists( source ) ) {
			log( `${ sourceFile } [FAILURE] Cannot find source` )
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
				log( `${ sourceFile } [FAILURE] Unknown error ==> `, fsOpResult )
			}
			else {
				log( `${ sourceFile } [OK] File created` )
			}
		}

		await initializeFiles( files )
		return true
	}
}

function help() {
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

function header() {
	log( '🔳  🔳  Humble' )
	log( '🔳🔳🔳  Block' )
	log( '🔳  🔳  Generator\n' )
}

// use fs.access() instead?
function pathExists( path ) {
	try {
		return fs.existsSync( path )
	}
	catch ( error ){
		console.error( 'An error occurred while checking if this path exists: ', path )
		console.error( error )
		return null
	}
}
