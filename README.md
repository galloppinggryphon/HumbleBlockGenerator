# [HUB, the Humble Block Generator](https://github.com/galloppinggryphon/HumbleBlockGenerator)

🟥🟧🟨🟩

**Tool for creating custom blocks f**or *Minecraft Bedrock Edition* **based on templates -- quickly, conveniently, efficiently.**

🟥🟧🟨🟩

Bedrock affords powerful abilities to create custom blocks -- but manually creating dozens or even hundreds of blocks can be tedious business, with each block definition requiring its own JSON file and lots of boilerplate. Blocks tend to use many of the same features, resulting in lots of copying and pasting. And when Minecraft is updated you may have to edit all of them. There are tools that can help with creating blocks, especially with validating JSON configurations, but not -- that I have found -- with templating. The Humble Block Generator, HUB, can help.

| Features 💡 |
| ----------- |
| 🟩 Auto-generate block JSON definition files from declarative templates<br>🟩 Highly flexible template structures, from flat to deeply nested<br>🟩 Easily create block permutations from materials/textures<br>🟩 Create presets containing commonly used code, e.g. block rotation<br>🟩 Automatic block name and title string generator from permutations<br>🟩 Efficient code -- cuts down on boilerplate, add a dozen permutations in as little as a single line<br>🟩 Convenient editing -- multiple blocks can be defined in a single file |
<br>
`*` permutations means variations of statically generated blocks, not to be confused with the permutations property used by Minecraft in block definition files.

- - -

## Getting started 🏃‍♀️

### **What you need** 🟧

* [ ] node.js >= `v14.x`
* [ ] NPM >= `v6.x`
* [ ] Git or a zip file extractor
* [ ] A code editor (e.g. VSCode)
* [ ] An up-to-date version of Minecraft Bedrock

### **Installation** 🟧

1. Download the project to an empty folder
Download options:
    1. Download zip file from [Releases](https://github.com/galloppinggryphon/fluffy-doodle/releases) and unzip
    2. Download with git: `git clone https://github.com/galloppinggryphon/HumbleBlockGenerator.git`
2. Run `npm install` to initialize and download a few small dependencies
3. That's it.

### **Try it out** 🟧

**From the command line/terminal:**

* Run `npm run build` to generate example blocks
* For help, run `npm start`

Output will (by default) be placed in `/output`.

For more detailed instructions, see section *Running and configuring HUB*.

### Examples 🟧

Find lots of example templates and output in the [`examples folder`](./examples).

When HUB is installed, it sets up necessary configuration files with a few example blocks (see `scaffolding.json`, `blocks-vslab.json`, `presets.json`).

- - -

## Powerful permutations 🧬

HUB's most powerful feature is creating block permutations based on declarative templates. It makes it easy to create blocks with shared features, for example subtypes within the same category, like different kinds of stairs, columns, walls and so on.

There are two ways of creating permutations:

1. `Nested block permutations`: Blocks are created based on inherited properties from its ancestors
2. `Material permutations`: Blocks are created by combining lists of textures or material instances with generated block variations.

Thus it becomes almost effortless to create nearly infinite variations of blocks without having to copy-paste properties into every single block file. Using permutations and presets, it becomes possible to create a dozen blocks in the same amount of code it takes to create just one block by hand.

### Example 🟧

Let's say we want to create a set of vertical slabs in different dimensions (thin, medium, thick) and with 5 different textures -- 1 category x 3 sub-categories x 5 texture variations. Using our math superpowers, 1x3x5 = 15 unique blocks, requiring 15 JSON files. Not an unreasonable number, but very tedious to create manually. If we wanted further sub-types of vertical slabs (e.g. alignments: centre, edge).

| Category | x | Block type | x | Textures | = | Block permutations |
| -------- | --- | ---------- | --- | -------- | --- | ------------------ |
| Vertical slab (vslab) | x | thin<br>medium<br>thick | x | brick<br>birch\_planks<br>cut\_copper<br>dark\_oak\_planks<br>stonebrick | = | vslab\_thin\_brick<br>vslab\_thin\_birch\_planks<br>...<br>vslab\_medium\_brick<br>...<br>vslab\_thick\_\* |

The table above illustrates how nested variations and materials create different blocks. The code below shows a truncated example of what the actual JSON template looks like. The full example is in [examples/blocks-vslab.json](./examples/blocks-vslab.json).

```
{
    "vslab": {
        "title": "Vertical slab - ",
        "textures": ["brick", "cut_copper", "birch_planks", "dark_oak_planks", "stonebrick"],
        "permutations": {
            "thin": {
                "title": "Thin",
                "geometry": "vslab_thin"
            }
        }
    }
}
```

The efficiency of this code is evident: 17 lines of code generates 10 discrete blocks. The cost of adding further sub-types is now very small (just four lines).

Too see the generated JSON block definition files, look in the [`examples/output/blocks/vslab`](./examples/output/blocks/vslab) folder.

#### How it works

* Permutations of the block are created based on both nesting -- two levels -- and an array of textures
* Each texture is applied to each unique permutation -- it is a simple list of valid texture names as would be found in `terrain-textures.json`
* Names are auto-generated based on the permutation key (e.g. `vslab + thin`);
* Titles are generated from the `title ` property
* One Minecraft property is added to the block `components ` section: `geometry`. The `minecraft` prefix is added automatically during processing and can be omitted. Likewise, the `geometry` prefix is added automatically to the value
* Each block is created on top of a scaffolding template of boilerplate shared by all blocks (see `scaffolding.json`)

### A note on permutation proliferation and data driven blocks 🟧

HUB makes it possible to create staggering number of custom blocks very quickly, because every permutation of a block has to be statically generated. Fortunately, Bedrock is moving in the direction of data driven blocks -- making it possible to change block properties in-game. Vanilla blocks have long relied on internal block states to evince properties like different textures or open/closed states. Custom blocks can do this too now, to some extent. Block properties can be changed dynamically, including textures, but it still requires a lot of static code. Hopefully, Mojang will continue down the path of enabling dynamic properties so that,one day, block shapes and textures can be dynamically combined rather than statically generated.

- - -

## Creating block templates 🧩

There are three ways to assemble blocks:

1. Nested permutations
2. Material/texture permutations
3. Injecting presets (code snippets)

Templates are created declaratively using JSON. Template code can consist of either Minecraft block definition properties or keywords that provide instruction to the block generator about how to combine code or generate new permutations. These keywords are called directives, because they direct the block generator.

A number of directives are available, listed briefly below. In addition, some custom processing is done of the Minecraft properties `geometry` and `material_instances`.

| Directive | Description |
| --------- | ----------- |
| `apply` | Inject presets into block |
| `export` | Turn export of block or block permutation on/off |
| `materials` | Generate permutations from sets of materials |
| `permutations` | Create block variations from nested block templates |
| `render` | Define advanced rendering options |
| `texture` | Apply texture to single block permutation |
| `textures` | Create permutatations from simple list of textures |
| `title` | Define (part of) a block's pretty title |
| `type` | Define how the permutation name/title will be generated |

### Nested block permutations 🟧

Blocks are created by inheriting properties from ancestor templates and by passing off its genetic material to its descendants. When block templates are processed, all possible combinations of a block are created based on nesting and inheritance. Children inherit the properties of their ancestors, add some of their own, and pass them down to their descendants. To add nested permutations, use the `permutations` directive.

Permutations are named after its chain of ancestors, glued together with configurable strings (see more details below). This generates the `identifier` property.

For example, the parent (root) `stairs` with the children `winding` and `stringed` could generate blocks named `stairs_winding` and `stairs_stringed`. If `stringed` further had its own permutations, like `carpeted` and `railing`, we could get the blocks `stairs_stringed_carpeted` and `stairs_stringed_railing`.

**Permutation object syntax:**

```
// Unique permutation name
["permutation-name"]: {
    //Add nested permutations
    "permutations": {},

    // Minecraft properties and other HUB directives
    ["property"]: ...
}
```

**Nesting syntax:**

```
// Nested permutations
["permutation-root"]: {
    "permutations": {
        ["permutation-level-1"]: {
            "permutations": {
                ["permutation-level-3"]: {...}
```

**A minimal example:**

```
"stairs": {
    "permutations": {
        "stringed": {
            "permutations": {
                "with_railing": ...

// ==> stairs_stringed_with_railing
```

### Permutation names (block name/identifier) 🟧

Block names (the `identifier` property) are generated from permutation object keys. Minecraft imposes limits on which characters can be used in the identifier property.

**Known constraints:**

* Valid characters: `a-z`, `0-9`, `_-.()`
* Illegal characters: `space,:;+`
* The block `identifier` must begin with a letter -- and thus also the root permutation key
* *All permutation names must be unique*

### Block titles 🟧

HUB can also generate 'pretty' or human readable titles, glued together much like block names. Use the `title` directive, inside a permutation object.

**Syntax:**

```
"title": "Title String"
```

Block titles are saved in a translation file, not in block definition files. Translation files are text files mapping block identifiers to strings based on language. HUB generates this translation file in the output folder. By default it creates a language file for English (`en_US.lang`); it cannot currently create more (`#todo`). The language can be configured in `config.js` (more details later on).

Titles can contain a wider range of characters than block names, but some symbols may not be accepted by Minecraft. Emojii are not recommended.

### Name and title templates 🟧

How block names and titles are glued together can be controlled with the `type` directive, in combination with separators defined in `config.js`. It's possible to use different separators to join different permutation levels -- handy for making it easier to read block lists (e.g. when using the `give` command) or to understand from a block title how it's put together.

Use `type` to define different kinds of permutations to differentiate, e.g. size, subtype, style. Permutations without the `type` directive fall back to a default separator, e.g. `.` ( a dot).

**Example:**

```
"column": {
    "permutations": {
        "doric": {
            "type": "style" // style is configured to use '--' as a separator

// ==> column--doric
```
<br>
In `config.js`, use the `titleSeparators` and `nameSeparators` to configure `type` keywords and separators.

**Syntax for separator configuration objects:**

```
{
    // Required - default separator
    "*": "separator", //e.g. -- or _

    // User defined keywords, use with 'type'
    ["type"]: "separator"

    // Configure prefix and suffix
    ["type"]: ["prefix", "suffix"], //e.g. "(", ")"

    // Built-in template, used for texture permutations
    "materials": "separator"
}
```

### Anonymous branches and default permutations 🟧

In addition to creating permutations, it's possible to create unnamed and untitled permutation segments. It enables two useful options, described below.

1. Create a standard or default version of a block
2. Create branches or collections of properties that are applied to descendant permutations without adding segments to the block name

#### Standard or default permutation

Let's say we are creating stairs and we want both a set of normal or regular stairs and a set of winding stairs. The regular stairs should be the default. One option is to create named permutations, regular and winding, which are exported as `stairs_regular` and `stairs_winding`.

Another option is to omit the name (or permutation key) of the regular version, so that it is just called `stairs`. Setting a permutation key to `""` will cause it to be named after its parent.

**Note:**

* The root key cannot be empty.
* The `title` directive will be ignored if used in a branch.

<br>
**Example:**

```
"stairs": {
    "title": "Stairs",
    ..., //more properties
    "permutations": {
        // Empty permutation key
        "": {
            ... // properties
        },

        // Named permutation
        "winding": ...
    }
}
```

#### Anonymous branches (property collections)

A branch is a collection of properties that are applied to descendant permutations, but which does not add to the permutation name. This is useful if groups of permutations at the same level need to share characteristics.

Branches are created by using one or more `-`, or `dashes`, in the permutation key. Because permutations at the same level cannot have the same key, use one dash for the first branch, two dashes for the second branch, et cetera. The `title` directive will be ignored if used in a branch.

**Syntax:**

```
"permutations": {
    // A branch/collection
    "-": {
        ..., // properties to apply to descendants

        "permutations": ...
    }

    // Further branches
    ["--" | "---" | ...] : ...,
}
```

- - -

### Texture permutations 🟧

Each block generated by a template can have infinite texture variations -- no need to copy-paste a block five times to give it five different textures.

**There are two methods for creating texture permutations from blocks:**

| Directive | `textures` | `materials` |
| --------- | -------- | --------- |
| **Complexity** | Simple | Advanced |
| **Summary** | Quickly map textures to blocks with a simple list (array) of texture names.<br><br>Use this when each block takes just one texture, without transparency. | Use this to apply multiple textures per block, mapped to different block faces.<br><br>Configure advanced texture options (translucency and transparency) |

Some important things to note:

* The generator applies textures to each block using the `minecraft:material_instances` property
* Blocks must define a custom block model using the `minecraft:geometry` property
* Texture permutations can be added at any level of nesting and are inherited by descendants
* Nested directives are merged (recursively) before being applied
* It's only possible to use one or the other (`materials` takes precedence)

#### The 'render' directive

The textures and materials directives can be used in conjunction with another directive, render, to configure advanced rendering options. See more details below.

#### Applying textures manually

It is possible to add textures to each block variation by hand, using the `material_instances` property or the `texture` directive.

For more details, see section *Creating texture permutations manually* further down. See also section *Material instances: How Minecraft maps textures to blocks*.

#### Directive processing priorities

The generator may encounter incompatible combinations of directives/properties to apply textures. If this happens, HUB looks for directives in this order:

1. `material_instances`
2. `texture`
3. `materials`
4. `textures`

Only the first directive that is encountered will be processed, the rest are disregarded (with a warning). For example. if `texture` was defined, `materials` and `textures` would be ignored.

#### Note on textures and titles

Currently, HUB cannot generate 'pretty' titles from textures -- instead it uses the texture slug. Pretty texture titles is on the to-do list.

**Example**

```
"vslab": {
    "title": "Vertical slab",
    "textures": ["cracked_deepslate_bricks"]
}

//==> "Vertical slab - cracked_deepslate_bricks"
```

### The 'textures' directive 🟧

Use the `textures` directive to apply a set of textures to block permutations. This method is the simplest one and should be used when all descendant blocks require only a single texture.

Supply a list of valid textures (defined in `terrain_textures.json` from vanilla or an addon) as a list (array). Each texture is applied to each computed block template permutation.

When processed, `textures` generates the `minecraft:material_instances` property (see more details below).

All materials defined with `textures` are `opaque`, unless configure with the `render` directive.

**Syntax:**

```
// Array of valid texture names
"textures": [ "texture-1", "texture-2", "texture-3", ... ]
```

### The 'materials' directive 🟧

The `materials` directive is a more advanced method of applying textures to blocks and generating permuations. It enables the creation of named sets of textures that are used to generate block permutations. With this method, multiple textures can be applied to each block.

There are two ways of applying textures:

1. Simple syntax: Apply a single texture to blocks
2. Advanced syntax: Map multiple textures to different block faces and set advanced rendering options

The `materials` directive is configured with an object. Each first-level entry in the materials object is applied as a material permutation of a block.

**General syntax:**

```
materials: {
    //First level - add material permutations
    ["material-permutation"]: ... // texture name or material properties
}
```

**Example:**

```
"permutations: {
    "stairs_with_railing": {
        "materials: {
            "stone": ...,
            "jungle_wood_and_iron": ...,
        }
    }
}

// ==> Generated block permutations
stairs_with_railing_stone
stairs_with_railing_jungle_wood_and_iron
```

#### Simple 'materials' syntax

The first method resembles the `textures` directive in that it does not take any advanced options. Use it to map a single texture to an entire block.

However, it has two advantages:

1. It can be used to create a custom permutation name and title for a given texture
2. It can be combined with the advanced syntax

All materials defined with simple syntax are `opaque`, unless configure with the `render` directive.

**Simple syntax:**

```
"materials": {
    // Add single texture by name and use its name as the name of a material permutation
    // Automatically map to all block faces
    ["texture-name"]: true,

    // Add single texture with a custom name.
    // Create an entry with a custom name, which becomes a material permutation
    // Automatically map to all block faces.
    ["material-permutation"]: "texture-name",
}
```

#### Advanced 'materials' syntax

The main benefit of the `materials` directive is that it unlocks three advanced options:

1. Renaming and re-titling material permutations
2. Mapping textures to specific block faces
3. Configuring advanced texture rendering options

When using custom block geometry files, it's possible to give each surface (block face) a `material instance name`. These material instance names function as variables that can be used to map textures to one or more surfaces of a block (block faces). With the advanced syntax, `material instance names` can be mapped to a texture name or to a `material instance object`. This method also enables advanced rendering options.

When manually mapping textures and block faces, it is required to specify a default or fallback texture using the `*` wildcard. The simple syntax does this automagically. Named material instances override the default.

Scroll down to find more information on material instances.

**Advanced syntax (three options):**

```
"materials": {
    // 1) Add a material instance object as a default material
    ["material-permutation"]: {
        // material instance definition
    }

    // Manually map block faces and textures
    ["material-permutation"]: {
        // 2) Map a material instance name (block face) to a texture by name
        // It is automatically converted to a material instance object
        // Also possible to create a default material using the * wildcard
        ["material-instance-name" | "*"]: "texture-name",

        // 3) Map a material instance name (block face) to a material instance object
        ["material-instance-name" | "*"]: {
            // material instance definition
        }
    }
}
```

##### Example of the materials directive

**Simple syntaxt example:**

```
"materials": {
    // Map wildcard to texture
    "*": "brick",

    // Map block face to texture
    "lintel": "stone"
}
```

### Material instances: Mapping textures to surfaces and configuring advanced options 🟧

Minecraft uses the `minecraft:material_instances` property to apply textures to blocks. The `material_instances` property consists of one or more `material instance objects` that define textures texture along with rendering instructions. They make it possible to map textures to different block surfaces (block faces).

When HUB is processing the `textures`, `materials` and `texture` directives, it creates `material_instances` property for each block and generates material instances as instructed. Material instance objects can be used directly with the `materials` directive for texture mapping or configuring advanced rendering options (e.g. transparency or translucency).

#### Adding multiple textures to a single block

Custom geometry models can map each surface (or face) of cubes in the model to variables called `material instance names`. In block definition files (and block templates), these material instance names can be mapped to material instance objects.

Each variable `material instance name` can be unique, applied to only a single surface or block face (e.g. `north`, `south`, `east`, `west`, `up`, `down`) or can be used to refer to multiple block faces (e.g. `wall`, `window_glass`). Using the same material instance name on multiple block faces makes it possible to quickly apply different textures to different parts of a block, even to entire cubes in the block model.

#### Using material instances

Material instances are used by the `materials` directive and the `material_instances` property. When material instance objects are called for, they must be specifically mapped to material instance names defined in a block model (added with the `geometry` property).

It's possible to apply a default texture (material instance object) to all block faces:

* A default material instance is crated using the `*` wildcard
* It's thus not necessary to refer to all material instance names in a block model
* Specific material instance names always override the default texture

Note: All blocks must define a default material instance object.

**Syntax for mapping material instance names to material instance objects:**

```
// Use the * wildcrd to create a default texture that applies to all material instance names
"*": {
    // material instance object
},

// Refer to material instance names, variables that represent block faces
["material-instance-name"]: {
    // material instance object
},
```

#### Creating material instance objects

**Syntax for material instances objects:**

```
{
    // Required - reference to a valid texture (defined in terrain_textures.json by vanilla or an addon)
    "texture": "texture-name",

    // Optional - Specify how texture is rendered
    // If omitted, defaults to 'opaque'
    "render_method": "opaque" | "alpha_test" | "blend" | "double_sided",

    //Optional - Additional rendering options
    ("ambient_occlusion" | "face_dimming"): true | false
}
```

#### Advanced rendering options

With material instances, it's possible to configure both transparency and how light interacts with different block faces.

**Options:**

| Key | Options | Notes |
| --- | ------- | ----- |
| `render_method` | `opaque`\|`alpha_test`\| `blend`\|`double_sided` | `alpha_test`: for translucency<br>`blend`: for full transparency.<br>double\_sided: haven't discovered how this works<br><br>*Do not mix render methods for the same block.*<br><br>Both `blend` and `alpha_test` can handle `opaque` blocks, but use more processing power. |
| `ambient_occlusion` | `true`\|`false` | Turn smooth lighting on/off.  Disabling `ambient_occlusion` seems to make shadows teensy-weensy less harsh (in combination with `block_light_absorption: 0`)<br><br>Defaults: opaque: true; alpha\_test: false, blend: false |
| `face_dimming` | `true`\|`false` | Disabling creates very harsh light and shadows, weird floating effects. I have not found a use-case for this yet. |

For more information on render methods and advanced keys, see [Block Materials @ bedrock.dev](https://wiki.bedrock.dev/blocks/block-materials.html) and [material\_instances@Microsoft](https://docs.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_material_instances).

**Examples of different render methods:**

```
// Opaque (solid) block - minimal material instance definition
{ "texture": "brick" }

// Completely transparent glass
{ "texture": "glass", "render_method": "alpha_test" }

// Translucent glass, e.g. stained glass
{ "texture": "glass_light_blue", "render_method": "blend" }

// Partial block, use with block_light_absorption: 0 to minimize shadows
{ "texture": "stone", "render_method": "opaque", ambient_occlusion: false }
```

##### Do not mix render methods!

**Minecraft does not allow more than one render method within the same block!**

If transparency is required for one of the block faces, you must use the selected render method (`blend` or `alpha_test`) for all block faces. Both `alpha_test` and `blend` can handle opaque textures, but they use more processing power, so should only be used where necessary.

##### Minimum block format version

Minecraft introduced `material_instances` in format version `1.16.100`. This version is required to use
the `textures` or the `materials` directive -- or indeed the `material_instances` property.

Before `1.16.100`, textures and blocks were mapped in `blocks.json`, located in a resource pack. It it is still possible to use older format versions in combination with `blocks.json`, but HUB cannot help; this file must be created manually.

### The 'render' directive 🟧

To avoid bloat and duplication, a render directive is available to define advanced rendering options (see the section above). Any options specified with render are applied to all textures applied with the textures, materials or texture directives, as well as the material\_instances key.

The keys that can be used with `render` are the same that are valid in a material instance object (see syntax, or above), except for the `texture` key.

If `render_method` is defined in `render`, it takes precedent, because a single block cannot define material instances with different render methods. Other keys are not enforced.

**Syntax:**

```
"render": {
    "render_method: ...,
    "ambient_occlusion: ...,
    "face_dimming": ...
}
```

**Example:**

```
// Example of 'render' used with 'textures'
{
    "textures": ["stonebrick", "glass_light_blue"],
    "render": {
        "render_method": "blend"
    }
}
```

For more details, see *Advanced rendering options* above.

### Creating texture permutations manually with 'texture' or 'material\_instances' 🟧

Nested block permutations based on textures can be defined manually using either `texture` directive or the `minecraft:material_instances` property. To create material variations, just add a nesting level to a block definition.

The `texture` directive offers a simple way to add a single texture to a block, automatically generating a material instance object and the `material_instances` property. To add multiple textures or control advanced texture options, use `material_instances` directly (the `minecraft` prefix can be omitted).

#### Using the 'texture' directive

**Syntax for the** `texture` **directive:**

```
// Use valid texture name from terrain_textures.json
"texture": "texture-name"
```

**Example:**

```
// Add a nesting level
"permutations": {
    "oak_dark_planks": {
        "title": "dark oak planks",
        "texture": "dark_oak_planks"
    }
}
```

#### Using the 'material\_instances' property

The syntax for `material_instances` is described above. For more details on `material_instances`, see section *Material instance definitions* above. See also the *Nested block permutations* section.

**Example:**

```
"permutations": {
    "stone-and-acacia": {
        "title": "stone and jungle planks",
        "material_instances": {
            "*": { "texture": "stone" },
            "frame": { "texture": "jungle_planks" },
        }
    }
}
```

- - -

### Adding features with presets 🟧

Presets enable shared features between blocks without generating new permutations, e.g. properties that are often used together, like block mechanics and events.

#### Defining code presets

Presets are defined in `presets.json` by default. A set of example presets are bundled with HUB on install.

**Note that presets cannot include other presets or directives -- use built-in Mineraft properties only.**

**Syntax:**

```
// Simple template
["template-1"]: {
    // Minecraft properties
},

// Advanced template, with variations
["template-2"]: {
    "common": {
        // Minecraft properties shared by all variations
    },
    "variation-1-name: {
        // Minecraft properties
    }
}
```

**Simple example:**

```
"bright_and_slippery": {
    "block_light_emission": 0.8,
    "friction": 0.7,
}
```

For an advanced example, see [examples/presets.json](./examples/presets.json).

#### Applying presets (usage)

To inject or apply a template, add it with the `apply` directive to any level of a block template.

**Syntax:**

```
["block-permutation"]: {
    "apply": {
        ["template-1"]: true | false, // Set to true to enable simple variation
        ["template-2"]: "variation-name" // Inject a template variation
    }
}
```

Let's say we're adding the templates `bright_and_slippery` and `emit_particles_when_walked_on` to the block `crystal_block`.

**Example:**

```
// Add two templatse to the block 'crystal_block':
// 'bright_and_slippery' and 'emit_particles_when_walked_on'
"crystal_block": {
    "apply": {
        "bright_and_slippery": true,
        // Use a variation
        "emit_particles_when_walked_on": "totem"
    }
}
```

#### Example presets

HUB is bundled with a few example presets in [examples/presets.json](./examples/presets.json).

| Template key | Description | Usage |
| ------------ | ----------- | ----- |
| `rotation` | Use the `rotation` key to enable rotating custom blocks when they are placed. Adds all the necessary boilerplate (properties, event triggers, event definitions and block state permutations). ~~The `rotation ` feature has three variations to let you select the axis of rotation (`x`, `y` or `z`).~~ Note: currently, only the y-axis variation is included. | "rotation": "y-axis" |
| `bright_and_slippery` | Make blocks emit light and reduce their friction. Included for demonstration purposes. | "bright\_and\_slippery": true |
| `emit_particles_-when_walked_on` | Make surface emit particles when walked on by an entity. Included for demonstration purposes. | "emit\_particles\_when\_walked\_on": "totem" |

- - -

### Minecraft properties 🟧

All built-in Minecraft block properties can be added to any level of a block template. *Note that there is very little validation!*

Minecraft properties can be used with or without the `minecraft` prefix. By default, defined properties not recognized as a HUB directive are added to the components section. However, it's possible to add properties to all the standard sections of a block definition: `components`, `description`, `events` and `permutations`.

For reference information on block properties, see [bedrock.dev/docs/stable/Blocks](https://bedrock.dev/docs/stable/Blocks).

**Example:**

```
// Not a full block definition
"strange_artefact": {
        // Add properties to 'components' section
        "geometry": "strange_artefact",
	"block_light_emission": 1,

        // Add properties to 'description' section
	"description": {
		"properties": {
			"strange:props": [1,2,3,4]
		}
	},
}
```

#### format\_version

All output files must specify a format\_version somewhere its template hierarchy. The recommended (and default) location is `scaffolding.json`.

```
"format_version": "1.16.100"
```

Unless you know what you are doing, I highly recommended you use the most recent format version, `1.16.100`. It is required by advanced features like material instances and events.

#### creative\_category

As of Bedrock `v1.17.40`, it's finally possible to use `creative_category` \- and access blocks through the block selector\! You'll have to add your block to a predefined category\. You must also specify the correct tab\.

**Syntax**

```
"creative_category": {
    // Major category (tab)
    "category": "construction",

    // Subcategory
    // The prefix 'itemGroup.name.' is added automatically
    // E.g. planks => itemGroup.name.planks
    "group": "planks"
}
```
<br>
Here's a list of all the categories and groups:
<span class="colour" style="color:rgb(98, 114, 164)">[https://wiki.bedrock.dev/documentation/creative-categories.html](https://wiki.bedrock.dev/documentation/creative-categories.html)</span>
<br>
#### material\_instances

See other sections:

* *Creating permutations with minecraft:material\_instances*
* *Defining materials (material instances)*

#### geometry

The `geometry` prefix can be omitted from the value; it is added automatically.

Use the <span class="colour" style="color:rgb(248, 248, 242)">`geometryPrefix` key in `config.js` to configure a name prefix to be added automatically.</span>

**Example:**

```
//config.js
geometryPrefix: 'hubgen__'

//blocks-vslab.json
"geometry": "vslab" // ==> "geometry.hubgen__vslab"
```

#### identifier

Because block names are created from permutation keys, `identifier` is not used. If included, it will be disregarded.

- - -

### Other topics 🟧

#### Export control

Control which blocks/permutations are exported with the export property. Can be used at any level. Defaults to true if omitted.

```
"export": true|false
```

#### Disable code or add documentation

All JSON files support adding inline comments to temporarily disable code or add documentation for your own benefit. Comments are stripped from all output.

```
"rotation": [90, 0, 0], // rotated 90 degrees on x axis, i.e. sideways
//"friction": 0.1
```

- - -

## Running and configuring HUB 🧰

See also *Getting Started* above.

### Command line arguments 🟧

**Available commands**
`npm start` Display help message.
`npm run build` Generate blocks using configuration from config.js.
`npm run build [arguments]` Advanced usage -- run-time config, see below.
`npm install` Download dependencies and initialize a new project.
`npm run init` Regenerate config.js and default template files (see below) if they do not exist.

#### Advanced usage

**Command line options**
`npm run build [blocks:file.json,[...]] [outputDir:relative/output/path]`

**Arguments**
`blocks`: Specify files containing block templates (permutations) to use. Each file name must be separated by a comma.
`outputDir`: Write files to a different directory, relative to the root of the project. If it does not exist it will be created.

Argument values containing spaces or special characters must be quoted, e.g. `"block definitions.json"`

**Examples**
`npm run build blocks:blocks_vslab.json,blocks_stairs.json outputDir:custom_output_dir`
`npm run build blocks:"blocks-*.json" outputDir:"output dir with spaces"`

### Configuration 🟧

HUB is configured with `config.json`, located in the root directory. If it is missing, run the command `npm run init` to generate a new one or make a copy of [examples/config.json](./examples/config.json).

Block configuration files are by default placed in the `./config` folder.

Settings

* `prefix`: set block namespace (required)
* `geometryPrefix`: set a geometry model name prefix (optional)
* `input`: define JSON template files to use as inputs
* `output`: define where and how to generate files

Documentation on configuring input files is below. Documentation for other options is included in `config.json`.

### Input file configuration 🟧

| Key | Default value | Contains | Details |
| --- | ------------- | -------- | ------- |
| <span class="colour" style="color:rgb(248, 248, 242)">`blockConfigDir`</span> | `config` | All block config files | Directory containing all the block config files. It's not recommended to store these in the root directory. |
| `blocks` | `blocks-*.json` | Block templates (permutations) | By default, HUB will look for block templates in all JSON files beginning with `blocks-.` Enables splitting block templates by category (e.g. stairs, slabs, columns, etc). |
| `scaffolding` | `scaffolding.json` | Block baseline | The root template of all generated block definition files, containing shared boilerplate and properties. |
| `presets` | `presets.json` | Code snippets | Create presets/code snippets for commonly shared features like block mechanics (e.g. rotation), events or sets of properties. Presets can be injected at any nesting level of a block template. |

- - -

## Output 📃

This software generates two types of output: block definitions and a text translation file. They must be placed (manually) inside a Bedrock addon (resource/behaviour pack) to work.

HUB will not help you create an addon -- see the Resources section for information on how to create one.

| Output | File type | Default output location | Move to |
| ------ | --------- | ----------------------- | ------- |
| Block definition files | `.json` | `output/blocks` | `<behaviour_pack>/blocks` |
| Text translatation files (block titles) | `.lang` | `output` | `<resource_pack>/texts` |

#### Notes about translatation files

* Use `config.js` to configure translation language
* HUB can currently only handle a single language
* Make sure you use the correct language code and that it's the same language as your game. The default is `en_US`
* The output of translation files will probably have to be merged manually with existing translation files.

- - -

## A few words of caution 💥

***With powerful features come the power to screw up powerfully.***

Here are some specific challenges to navigate:

### Updating blocks in existing worlds 🟧

Be very careful when updating previously generated blocks inside a world. Test with a few files at a time. Validate block generator output.

<b>*Always back up your world and previously generated block files.*</b>

### Incompatible combinations of permutations,m properties, presets, materials, events, etc 🟧

Always validate the output of this software, especially where you use advanced features like events and Minecraft permutations. Presets and nested properties may overwrite each other or just generally not work well together. Typos and mistakes could sneak in and create havoc. Quicker block generation also enables you to make mistakes more quickly.

<b>*Always back up your world and previously generated block files.*</b>

### Advanced block features are in beta 🟧

HUB should generate correct code, but it is not guaranteed to work in Minecraft. Many of the advanced fetures used by example HUB block templates (e.g. material instances, events) rely on the most recent block format version, `1.16.100`, which is still in beta, and are afflicted by a lot of bugs.

- - -

## Future directions 🚀

More features will come based on personal needs and experience. This software is quite young, so it remains to be seen what features work and don't work, and what's useful and not so useful.

Some improvements I could foresee:

* [ ] Generate pretty titles from textures
* [ ] Event system
* [ ] Use JSON schemas for Minecraft property validation and help
* [ ] More presets
* [ ] Include Minecraft add-on for block testing

- - -

## Resources for creating add-ons and custom blocks 📙

A few useful places to look for information on creating blocks and addons:

| Website | Resource | URLs |
| ------- | -------- | ---- |
| Minecraft Wiki | Add-on documentation | [https://minecraft.fandom.com/wiki/Bedrock\_Edition\_add-on\_documentation](https://minecraft.fandom.com/wiki/Bedrock_Edition_add-on_documentation) |
| bedrock.dev | Add-on reference | [https://bedrock.dev/](https://bedrock.dev/) |
| " | Wiki | [https://wiki.bedrock.dev/](https://wiki.bedrock.dev/) |
| " | Add-on tutorials | [https://wiki.bedrock.dev/guide/introduction.html](https://wiki.bedrock.dev/guide/introduction.html) |
| Microsoft Minecraft documentation | Offical documentation | [https://docs.microsoft.com/en-us/minecraft/creator/](https://docs.microsoft.com/en-us/minecraft/creator/) |
| " | Block reference | [https://docs.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock\_material\_instances](https://docs.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_material_instances) |
| Minecraft 'vanilla' addons | Game data and reference (zip files) | [https://aka.ms/resourcepacktemplate](https://aka.ms/resourcepacktemplate)<br>[https://aka.ms/behaviorpacktemplate](https://aka.ms/behaviorpacktemplate) |

- - -

## Software compatibility 🚩

**node.js**
The block generator depends on features only found in node.js version `1.14.x` and later.

**Bedrock**
HUB can create block definition files compatible with format version `1.16.100`, as required by advanced block features

Format version `1.16.100` introduces advanced features that are still considered beta by Mojang and many of these are unstable. As of Minecraft `1.17.11`, event related features continue to be especially fraught. For more information on current breakages, see the official bug tracker.

**Note:** HUB should generate correct code, but some features are extremely buggy in Minecraft and cannot be guaranteed to work.

- - -

## Known issues 🐛

Failure to empty output directory: HUB may sometimes fail to clear the output directory because some files are locked. This problem is likely temporary: just run HUB again.

- - -

## License 🚦

```
MIT License

Copyright (c) 2021 Bjornar Egede-Nissen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Final words**
No guarantee of any kind is made that this software will work or even run. If it does run, it may produce output (or it may not). If you choose to put the output of this software in a Bedrock addon, it may not work, and if it does work, it may break your world. If you play in survival mode, it may break your character. You have been warned.