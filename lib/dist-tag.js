exports = module.exports = distTag

var npm = require("./npm.js")
  , mapToRegistry = require("./utils/map-to-registry.js")
  , readLocalPkg = require("./utils/read-local-package.js")
  , log = require("npmlog")
  , npa = require("npm-package-arg")
  , semver = require("semver")
  , assert = require("assert")

distTag.usage = "npm dist-tag add <pkg>@<version> [<tag>]"
            + "\nnpm dist-tag del <pkg> <tag>"
            + "\nnpm dist-tag ls [<pkg>]"

function distTag (args, cb) {
  var cmd = args.shift()
  switch (cmd) {
    case "add": case "a": return add(args[0], args[1], cb)
    case "del": case "d": case "rm":  case "r": case "remove": return remove(args[1], args[0], cb)
    case "ls":  case "l": case "sl": case "list": return list(args[0], cb)
    default: return cb("Usage: "+distTag.usage)
  }
}

function add (spec, tag, cb) {
  var thing = npa(spec || "")
  var pkg = thing.name
  var version = thing.rawSpec
  var t = (tag || npm.config.get("tag")).trim()

  log.verbose("dist-tag add", t, "to", pkg+"@"+version)

  if (!pkg || !version || !t) return cb("Usage:\n"+distTag.usage)

  if (semver.validRange(t)) {
    var er = new Error("Tag name must not be a valid SemVer range: " + t)
    return cb(er)
  }

  fetchTags(pkg, function (er, tags) {
    if (er) return cb(er)

    if (tags[t] === version) {
      log.warn("dist-tag add", t, "is already set to version", version)
      cb()
    }
    tags[t] = version

    putTags(pkg, tags, function (er) {
      if (er) return cb(er)

      console.log("+"+t+": "+pkg+"@"+version)
      cb()
    })
  })
}

function remove (tag, pkg, cb) {
  log.verbose("dist-tag del", tag, "from", pkg)
  fetchTags(pkg, function (er, tags) {
    if (!tags[tag]) {
      log.info("dist-tag del", tag, "is not a dist-tag on", pkg)
      return cb(new Error(tag+" is not a dist-tag on "+pkg))
    }

    var version = tags[tag]
    delete tags[tag]

    putTags(pkg, tags, function (er) {
      if (er) return cb(er)

      console.log("-"+tag+": "+pkg+"@"+version)
      cb()
    })
  })
}

function list (pkg, cb) {
  if (!pkg) return readLocalPkg(function (er, pkg) {
    if (er) return cb(er)
    if (!pkg) return cb(distTag.usage)
    list(pkg, cb)
  })

  fetchTags(pkg, function (er, tags) {
    if (er) {
      log.error("dist-tag ls", "Couldn't get dist-tag data for", pkg)
      return cb(er)
    }
    var msg = Object.keys(tags).map(function (k) {
      return k+": "+tags[k]
    }).sort().join("\n")
    console.log(msg)
    cb(er, tags)
  })
}

function fetchTags (pkg, cb) {
  mapToRegistry(pkg, npm.config, function (er, uri, auth) {
    if (er) return cb(er)

    npm.registry.get(uri, { auth : auth }, function (er, data) {
      if (er) return cb(er)
      var tags = data["dist-tags"]
      if (!tags || !Object.keys(tags).length) {
        return cb(new Error("No dist-tags found for " + pkg))
      }

      cb(null, tags)
    })
  })
}

function putTags (pkg, tags, cb) {
  assert(typeof pkg === "string", "must pass name of package to putTags")
  assert(tags, "must pass tags to putTags")
  assert(typeof tags === "object", "tags must be object literal in putTags")
  assert(
    typeof tags.latest === "string",
    "must still have 'latest' tag set in putTags"
  )

  mapToRegistry(pkg, npm.config, function (er, uri, auth) {
    if (er) return cb(er)

    npm.registry.get(uri, { auth : auth }, function (er, data) {
      if (er) return cb(er)
      var orig = data["dist-tags"]
      if (!orig || !Object.keys(orig).length) {
        return cb(new Error("No dist-tags found for " + pkg))
      }

      data = {
        _id         : data._id,
        _rev        : data._rev,
        "dist-tags" : tags
      }

      var dataPath = pkg.replace("/", "%2f") + "/-rev/" + data._rev
      mapToRegistry(dataPath, npm.config, function (er, uri, auth) {
        if (er) return cb(er)

        var params = {
          method : "PUT",
          body   : data,
          auth   : auth
        }
        npm.registry.request(uri, params, function (er, data) {
          if (!er && data.error) {
            er = new Error("Failed to update package metadata: "+JSON.stringify(data))
          }

          if (er) {
            log.error("dist-tags put", "Failed to update package metadata")
          }

          cb(er, data)
        })
      })
    })
  })
}
