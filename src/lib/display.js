import chalk from 'chalk'

const log = console.log.bind( console )

// https://www.lihaoyi.com/post/BuildyourownCommandLinewithANSIescapecodes.html

// escapeUnicode()
function escapeUnicode( str = '' ) {
	// return str.replace( /[^\0-~]/g, function( ch ) {
	// 	return `\\u${ ( `000${ ch.charCodeAt().toString( 16 ) }` ).slice( -4 ) }`
	// } )

	const strarr = [
		chalk.red( 'Hello world' ),
		chalk.bold(
			'a long sentence in the middle',
			chalk.bgBlue( 'goo goo goo goo' ),
		),
		'normal',
	]

	str = strarr.join( ' ' )

	const strspltRx = new RegExp( `.{1,${ 15 }}`, 'g' )
	const strsplt = str.match( strspltRx )

	log( str )

	// eslint-disable-next-line no-control-regex
	var rrx = /(\u001B(?:\[[\d]{1,3}m)?)+/gui

	m1 = str.replace( rrx, '' )

	// m2 = [ ...m1 ]

	log( m1 )

	return

	log( strsplt[ 1 ] )

	// eslint-disable-next-line no-control-regex
	var rx1 = /(?<=\u001B)(?:(\[[\d]{1,3}m)([^\u001B]*))+/gui

	var m1, m2, m3

	m1 = str.matchAll( rx1 )

	m2 = [ ...m1 ]

	const elements = m2.reduce( ( result, group ) => {
		result.codes.push( group[ 1 ] )
		result.string.push( group[ 2 ] )
		return result
	}, { codes: [], string: [] } )

	const nstr = 1

	for ( const codePoint of str ) {
		log( codePoint.charCodeAt( 0 ).toString( 16 ) )
	}

	return
	const strArr = [ ...str ]

	strArr.forEach( ( c ) => {
		log( c, c.codePointAt( 0 ) )
	} )

	return

	return str.replace( /./g, function( c ) {
		return `\\u${ ( `000${ c.charCodeAt( 0 ).toString( 16 ) }` ).substr( -4 ) }`
	} )
}

/**
 * Split string by control characters
 * Split string by length
 * Include ALL ANSI codes from previous line
 */

function print( ...msg ) {
	const msgStr = msg.join( '' )
	log( msgStr )
}

function box( title, msgLines, { width = 60, margin = 3 } = {} ){
	const lineMargin = ' '.repeat( margin )

	// const maxLength = width - ( margin * 2 ) - 2
	// const maxLengthRx = new RegExp( `.{1,${ maxLength }}`, 'g' )

	// eslint-disable-next-line no-control-regex
	const cleanStrRx = /(\u001B(?:\[[\d]{1,3}m)?)+/gui

	const blankLine = `║${ ' '.repeat( width - 2 ) }║`

	const hBorder = ( len ) => '═'.repeat( len )

	const msgLine = ( line ) => {
		const cleanLine = line.replace( cleanStrRx, '' )

		// const lines = line.match( maxLengthRx ) || []

		// lines.forEach( ( str ) => {
		const linePadding = ' '.repeat(
			width - ( margin * 2 ) - cleanLine.length - 2,
		)
		print( `║${ lineMargin }`, line, linePadding, `${ lineMargin }║` )
		// } )

	}

	const titleBoxStr = `  ${ title }  `
	const cleanTitle = titleBoxStr.replace( cleanStrRx, '' )
	const titleBox = chalk.bgCyanBright( chalk.bold( titleBoxStr ) )

	// ╔ ═ ╗╚ ╝║
	print(
		'╔══',
		` ${ titleBox } `,
		hBorder( width - cleanTitle.length - 6 ),
		'╗',
	)
	print( blankLine )

	msgLines.forEach( msgLine )

	// log( '║  ', ...result, linePadding, '║' )
	print( blankLine )
	print( `╚${ '═'.repeat( width - 2 ) }╝` ) // n = 50

}

function error( message, ...x ) {
	log()
	log( chalk.bgRedBright.bold( ` ERROR! ` ), message )
	log()
}

function header( msg ) {
	log()
	log( chalk.cyan( '≡≡≡≡≡' ), chalk.bgCyan.bold( msg ), chalk.cyan( '≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡' ) )
}

function lb( lines = 1 ) {
	log( '\n'.repeat( lines ) )
}

function section( str ) {
	log( chalk.blueBright( `[${ str }]` ) )
}

export { log }

export default {
	box,
	error,
	header,
	log,
	lb,
	section,
}
