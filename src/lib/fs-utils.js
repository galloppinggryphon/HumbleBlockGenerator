'use strict'

import fs, { promises as fsAsync } from 'fs'
import glob from 'glob'
import nodePath from 'path'
import stripJsonComments from 'strip-json-comments'

export function niceRelPath( path, ignore ) {
	return nodePath.join( '...', nodePath.relative( ignore, path ) )
}

/**
 * Read text contents of file (synchronous).
 *
 * @param {string} filename
 * @param {'error'|'warn'|'skip'|'throw'} [onError='error'] Error, warning, skip silently or throw exception (default)
 * @return {string} File contents
 */
export function readFile( filename, onError = 'skip' ) {
	let file
	try {
		file = fs.readFileSync( filename, 'utf8' )
	}
	catch ( err ) {
		switch ( onError ) {
			case 'error': console.error( err ); return false
			case 'warn': console.warn( err ); return false
			case 'skip': return false
		}

		throw err
	}
	return file
}

/**
 * Append to text file (async), but do not block program.
 *
 * @param {string} filePath
 * @param {string} fileName
 * @param {string} contents
 */
export async function saveFileAsync( filePath, fileName, contents ) {
	await fsAsync.mkdir( filePath, { recursive: true } )
	const fullFilename = nodePath.join( filePath, fileName )

	// write file asynchronously, but do not block
	fs.writeFile( fullFilename, contents, function( err ) {
		if ( err ) {
			throw new Error( err )
		}
	} )
}

/**
 * Copy file (async).
 *
 * @param {string} source
 * @param {string} destination
 * @param {boolean} overwrite
 * @return {string|undefined} Returns undefined on success, error message on failure.
 */
export async function copyFileAsync( source, destination, overwrite = false ) {
	const mode = overwrite ? 0 : fs.constants.COPYFILE_EXCL

	try {
		await fsAsync.copyFile( source, destination, mode )
		return
	}
	catch ( error ) {
		if ( error.errno === -4058 ) {
			return `Copy failed, source file does not exist ('${ source }').`
		}
		else if ( error.errno === -4075 ) {
			return `Copy failed, destination file already exists ('${ source }').`
		}
		return error.message
	}
}

/**
 * Check if a file or folder exists.
 *
 * @param {string} path
 */
export function pathExists( path ) {
	return fs.existsSync( path )
}

/**
 * Get files and folders from given path.
 *
 * @param {string} directoryPath
 * @param {boolean} [recursive=false] [false] Read files and folders recursively
 * @param {string} [filter=''] Glob pattern
 * @return Promise containing array of files.
 */
export async function readDirAsync( directoryPath, recursive = false, filter = '' ) {
	// const options = {
	// 	cwd: directoryPath
	// }
	const _path = nodePath.resolve( directoryPath )
	const pattern = nodePath.join( _path, filter || ( recursive ? '/**/*' : '/*' ) )

	const unixPattern = pattern && pattern.replace( /\\/g, '//' ) // Glob can't handle windows backslash!

	const results = await new Promise( ( resolve ) => glob( unixPattern, ( err, files ) => {
		if ( err ) {
			console.error( err )
			resolve()
		}
		const _files = files.map( ( x ) => nodePath.resolve( x ) )
		resolve( _files )
	} ) )
	return results
}

/**
 * Check if one directory is inside another.
 *
 * @param {string} child
 * @param {string} parent
 */
export function isChildOfDirectory( child, parent ) {
	const relative = nodePath.relative( parent, child )
	return !! relative && ! relative.startsWith( '..' ) && ! nodePath.isAbsolute( relative )
}

/**
 * Check if a directory is inside the current working directory.
 * Only work on paths inside process.cwd()
 *
 * @param {string} directoryPath
 */
export function isInsideCwd( directoryPath ) {
	return isChildOfDirectory( directoryPath, process.cwd() )
}

/**
 * Check if path is or is inside a forbidden directory.
 *
 * Illegal directories: node_modules|scripts|src|assets|examples
 *
 * @param {string} directoryPath
 * @param {string[]} illegalDirectories Custom list of directories to eschew
 * @returns
 */
export function isPathPermitted( directoryPath, illegalDirectories = undefined ) {
	const defaultIllegalPaths = /^(node_modules|scripts|src|assets|examples)/i
	illegalDirectories = illegalDirectories || defaultIllegalPaths
	return ! illegalDirectories.test( nodePath.relative( process.cwd(), directoryPath ) )
}

/**
 * Delete all files and folders at a given path.
 *
 * Todo: Fix rare rmdir -4048 error (EPERM: operation not permitted). Related to Onedrive?
 *
 * @param {string} directoryPath
 */
export async function eraseDirContentsAsync( directoryPath ) {
	async function _deleteFsObjectAsync( file, recursive = false ) {
		try {
			await fsAsync.rm( file, { recursive } )
		}
		catch ( error ) {
			// EPERM: operation not permitted (probably because  of file lock or permission error)
			// Error occurs even when files are successfully deleted
			// Treat as harmless in this context?
			if ( error.errno === -4048 ) {
				console.warn( `\nA possible error occurred while deleting files in '${ directoryPath }'.\nError: [EPERM: operation not permitted (-4048)].\n\nIf no other errors are reported, this is probably harmless.` )
				// throw ( error )
			}
			else {
				throw ( error )
			}
		}
	}

	if ( ! isPathPermitted( directoryPath ) ) {
		throw new Error( `Cannot use directory '${ directoryPath }': illegal path.` )
	}

	const files = await readDirAsync( directoryPath, true )

	// Delete folder contents recursively
	const results = files.reverse().map( async( file ) => {
		return await _deleteFsObjectAsync( file, true )
	} )

	await Promise.all( results )

	// Check if successful
	const residual = await readDirAsync( directoryPath, true )
	if ( residual.length ) {
		throw new Error( `Could not delete all files in '${ directoryPath }'.` )
	}
}

/**
 * Parse JSON. With comment stripping.
 *
 * @param {string} data Stringified JSON
 * @param {boolean} [true] tolerateError
 * @return {Record<string, any>} JSON object
 */
export function parseJson( data, tolerateError = true ) {
	let json
	try {
		json = JSON.parse( stripJsonComments( data ) )
	}
	catch ( error ) {
		if ( ! tolerateError ) {
			throw error
		}
		return ''
	}
	return json
}

/**
 * Read and parse multiple JSON files.
 *
 * @param {string|string[]} files
 * @param {boolean} tolerateErrors
 * @return {Object<string, any>|boolean|''} Returns false on read failure, empty string on parse failure
 */
export function loadJsonFiles( files, tolerateErrors = false ) {
	const onError = tolerateErrors ? 'skip' : 'warn'
	let exports

	if ( files && typeof files === 'string' ) {
		let file = readFile( files, onError )
		return file && parseJson( file, false )
	}

	exports = Object.entries( files ).reduce( ( results, [ key, filename ] ) => {
		if ( filename ) {
			let file = readFile( filename, onError )

			if ( file ) {
				results[ key ] = parseJson( file )
			}
		}
		else {
			results[ key ] = false
		}
		return results
	}, {} )
	return exports
}
