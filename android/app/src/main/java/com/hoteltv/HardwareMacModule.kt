package com.hoteltv

import android.content.Context
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.net.NetworkInterface
import java.util.Collections

/**
 * Resolves a hardware MAC for the Welcome API on Android TV (Ethernet, Wi‑Fi, USB‑Ethernet).
 * Many devices block sysfs for apps; we also try [NetworkInterface], [WifiManager], and getprop.
 */
class HardwareMacModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "HardwareMac"

  @ReactMethod
  fun getPreferredMac(promise: Promise) {
    try {
      val mac =
        readSysfsMacDynamic() ?:
        readStaticSysfsPaths() ?:
        readMacFromNetworkInterfaces() ?:
        readWifiManagerMac() ?:
        readBootPropMac()
      if (mac != null) {
        promise.resolve(mac)
      } else {
        promise.resolve("")
      }
    } catch (e: Exception) {
      promise.reject("E_HARDWARE_MAC", e.message, e)
    }
  }

  /** Multi-line report for Metro when MAC stays empty (interface names + raw address files). */
  @ReactMethod
  fun getDiagnosticInfo(promise: Promise) {
    try {
      val sb = StringBuilder()
      val base = File("/sys/class/net")
      sb.appendLine("sys_class_net_dir=${base.absolutePath} exists=${base.isDirectory}")
      if (base.isDirectory) {
        base.listFiles()?.sortedBy { it.name }?.forEach { dir ->
          if (!dir.isDirectory) return@forEach
          val name = dir.name
          try {
            val addrFile = File(dir, "address")
            val raw = if (addrFile.canRead()) addrFile.readText().trim() else "(not readable)"
            sb.appendLine("if:$name address_file=$raw")
          } catch (e: Exception) {
            sb.appendLine("if:$name err=${e.message}")
          }
        }
      }
      sb.appendLine("--- NetworkInterface ---")
      try {
        Collections.list(NetworkInterface.getNetworkInterfaces()).sortedBy { it.name }.forEach { ni ->
          val ha = try {
            ni.hardwareAddress
          } catch (_: Exception) {
            null
          }
          val hex = if (ha != null && ha.isNotEmpty()) {
            ha.joinToString(":") { b -> String.format("%02X", b) }
          } else {
            "(null)"
          }
          sb.appendLine("ni:${ni.name} up=${ni.isUp} loopback=${ni.isLoopback} hw=$hex")
        }
      } catch (e: Exception) {
        sb.appendLine("ni_list_err=${e.message}")
      }
      sb.appendLine("--- getprop ---")
      BOOT_MAC_PROPS.forEach { key ->
        val v = runGetprop(key)
        if (v.isNotEmpty()) sb.appendLine("$key=$v")
      }
      @Suppress("DEPRECATION")
      try {
        val wifi = reactApplicationContext.applicationContext
          .getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val info = wifi?.connectionInfo
        sb.appendLine("wifi.connectionInfo.mac=${info?.macAddress ?: "null"}")
      } catch (e: Exception) {
        sb.appendLine("wifi_err=${e.message}")
      }
      promise.resolve(sb.toString())
    } catch (e: Exception) {
      promise.reject("E_DIAG", e.message, e)
    }
  }

  /** Walk every interface under /sys/class/net (covers OEM-specific names). */
  private fun readSysfsMacDynamic(): String? {
    val base = File("/sys/class/net")
    if (!base.isDirectory) return null
    val names = base.listFiles()?.filter { it.isDirectory }?.map { it.name } ?: return null
    val ranked = names
      .filter { it != "lo" && !isSkippableVirtualInterface(it) }
      .sortedWith(
        compareBy(
          {
            when {
              it.startsWith("eth") -> 0
              it.startsWith("en") && it.length <= 6 -> 1
              it.startsWith("wlan") || it.startsWith("wl") || it.startsWith("wifi") -> 2
              else -> 3
            }
          },
          { it },
        ),
      )
    for (name in ranked) {
      try {
        val raw = File(base, "$name/address").readText().trim()
        val mac = normalizeMacString(raw) ?: continue
        if (isValidHardwareMac(mac)) return mac
      } catch (_: Exception) {
        // unreadable (SELinux) or missing
      }
    }
    return null
  }

  private fun readStaticSysfsPaths(): String? {
    for (path in STATIC_SYSFS_PATHS) {
      try {
        val raw = File(path).readText().trim()
        val mac = normalizeMacString(raw) ?: continue
        if (isValidHardwareMac(mac)) return mac
      } catch (_: Exception) {
        // ignore
      }
    }
    return null
  }

  private fun readMacFromNetworkInterfaces(): String? {
    val interfaces = try {
      Collections.list(NetworkInterface.getNetworkInterfaces())
    } catch (_: Exception) {
      return null
    }

    for (name in PREFERRED_INTERFACE_NAMES) {
      val ni = interfaces.find { it.name == name } ?: continue
      macFromInterface(ni)?.let { return it }
    }

    for (ni in interfaces) {
      if (ni.isLoopback) continue
      if (isSkippableVirtualInterface(ni.name)) continue
      macFromInterface(ni)?.let { return it }
    }
    return null
  }

  @Suppress("DEPRECATION")
  private fun readWifiManagerMac(): String? {
    return try {
      val wifi = reactApplicationContext.applicationContext
        .getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return null
      val info = wifi.connectionInfo ?: return null
      val raw = info.macAddress ?: return null
      if (raw.isBlank()) return null
      if (raw.equals("02:00:00:00:00:00", ignoreCase = true)) return null
      normalizeMacString(raw.replace('-', ':'))?.takeIf { isValidHardwareMac(it) }
    } catch (_: Exception) {
      null
    }
  }

  private fun readBootPropMac(): String? {
    for (key in BOOT_MAC_PROPS) {
      val raw = runGetprop(key)
      if (raw.isEmpty()) continue
      normalizeMacString(raw.replace('-', ':').replace(" ", ""))?.let {
        if (isValidHardwareMac(it)) return it
      }
    }
    return null
  }

  private fun runGetprop(key: String): String {
    val attempts = listOf(
      arrayOf("/system/bin/getprop", key),
      arrayOf("getprop", key),
    )
    for (cmd in attempts) {
      try {
        val p = Runtime.getRuntime().exec(cmd)
        p.waitFor()
        val out = p.inputStream.bufferedReader().use { it.readText().trim() }
        if (out.isNotEmpty()) return out
      } catch (_: Exception) {
        // try next path
      }
    }
    return ""
  }

  private fun macFromInterface(ni: NetworkInterface): String? {
    if (ni.isLoopback) return null
    val ha = try {
      ni.hardwareAddress
    } catch (_: Exception) {
      null
    } ?: return null
    if (ha.isEmpty()) return null
    val sb = StringBuilder()
    for (i in ha.indices) {
      sb.append(String.format("%02X", ha[i]))
      if (i < ha.lastIndex) sb.append(":")
    }
    val s = sb.toString()
    return if (isValidHardwareMac(s)) s else null
  }

  /**
   * Accepts `aa:bb:...`, `aa-bb-...`, or 12 hex chars without separators.
   */
  private fun normalizeMacString(raw: String): String? {
    val t = raw.trim().lowercase().replace("-", ":").replace(" ", "")
    if (t.length == 12 && t.matches(Regex("^[0-9a-f]+$"))) {
      return (0 until 6).joinToString(":") { i -> t.substring(i * 2, i * 2 + 2).uppercase() }
    }
    val parts = t.split(":").filter { it.isNotEmpty() }
    if (parts.size != 6) return null
    if (parts.any { !it.matches(Regex("^[0-9a-f]{1,2}$")) }) return null
    return parts.joinToString(":") { it.padStart(2, '0').uppercase() }
  }

  private fun isValidHardwareMac(mac: String): Boolean {
    if (mac == "00:00:00:00:00:00") return false
    if (mac == INVALID_PRIVACY_MAC) return false
    return true
  }

  private fun isSkippableVirtualInterface(name: String): Boolean {
    val n = name.lowercase()
    if (n == "lo") return true
    return n.startsWith("dummy") ||
      n.startsWith("tun") ||
      n.startsWith("tap") ||
      n.startsWith("sit") ||
      n.startsWith("docker") ||
      n.startsWith("veth") ||
      n.startsWith("virbr") ||
      n.startsWith("br-") ||
      n.startsWith("ifb") ||
      n.startsWith("teql")
  }

  companion object {
    private const val INVALID_PRIVACY_MAC = "02:00:00:00:00:00"

    private val STATIC_SYSFS_PATHS = listOf(
      "/sys/class/net/eth0/address",
      "/sys/class/net/eth1/address",
      "/sys/class/net/wlan0/address",
      "/sys/class/net/wlan1/address",
      "/sys/class/net/wifi0/address",
      "/sys/class/net/end0/address",
    )

    private val PREFERRED_INTERFACE_NAMES = listOf(
      "eth0", "eth1", "eth2",
      "en0", "end0", "enp0s3", "enp0s", "enp1s0",
      "wlan0", "wlan1", "wlan2",
      "wifi", "wifi0", "wl0", "wlp1s0", "wlp2s0",
      "rndis0", "usb0",
      "ap0", "p2p0",
    )

    private val BOOT_MAC_PROPS = listOf(
      "ro.boot.wifimac",
      "ro.boot.wifi_mac",
      "ro.wifimac",
      "ro.vendor.wifi.mac",
      "persist.sys.wifi.mac",
      "ro.boot.ethmac",
      "ro.boot.eth_mac",
      "ro.eth_mac",
    )
  }
}
