'use strict'
import stringify from 'json-stringify-pretty-compact'
import stripJsonComments from 'strip-json-comments'
import { readFile, saveFileAsync } from './fs-utils.js'

/**
 * Parse JSON. With comment stripping.
 *
 * @param {string} data Stringified JSON
 * @param {boolean} tolerateError [true]
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
		return
	}
	return json
}

/**
 * Read and parse multiple JSON files.
 *
 * @param {string|Record<string, string>} files
 * @param {boolean} tolerateErrors
 * @return {Record<string, any>} Returns undefined on failure
 */
export function loadJsonFiles( files, tolerateErrors = false ) {
	const onError = tolerateErrors ? 'skip' : 'warn'

	if ( files && typeof files === 'string' ) {
		const file = readFile( files, onError )
		return file ? parseJson( file, false ) : undefined
	}

	const exports = Object.entries( files ).reduce( ( results, [ key, filename ] ) => {
		if ( filename ) {
			try {
				const file = readFile( filename, onError )

				if ( file ) {
					results[ key ] = parseJson( file, tolerateErrors )
				}
			}
			catch ( err ) {
				if ( ! tolerateErrors ) {
					throw new Error( `Error in '${ filename }': ${ err.message }` )
				}
			}
		}
		else {
			results[ key ] = false
		}
		return results
	}, {} )
	return exports
}

export function loadJsonFile( filename, tolerateErrors = false ) {
	const onError = tolerateErrors ? 'skip' : 'warn'
	try {
		const file = readFile( filename, onError )

		if ( file ) {
			return parseJson( file, tolerateErrors )
		}
	}
	catch ( err ) {
		if ( ! tolerateErrors ) {
			throw new Error( `Error in '${ filename }': ${ err.message }` )
		}
	}
}

/**
 * Save object to disk.
 *
 * @param {{path: string, fileName: string}} fileInfo
 * @param {Object<string, any>} data
 */
export function saveDataToJson( fileInfo, data ) {
	const { path, fileName } = fileInfo
	const json = stringify( data, { indent: 4 } )
	const result = saveFileAsync( path, fileName, json )
	return result.then( ( err ) => {
		if ( err ) {
			return { fileInfo, error: err }
		}
	} )
}
