# ── React Native ─────────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# ── OkHttp (used by React Native networking) ─────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ── Kotlin & Coroutines ───────────────────────────────────────────────────────
-keep class kotlin.** { *; }
-dontwarn kotlin.**

# ── React Native Device Info ──────────────────────────────────────────────────
-keep class com.learnium.RNDeviceInfo.** { *; }

# ── VLC Media Player ──────────────────────────────────────────────────────────
-keep class org.videolan.** { *; }
-dontwarn org.videolan.**

# ── AsyncStorage ─────────────────────────────────────────────────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ── Linear Gradient ──────────────────────────────────────────────────────────
-keep class com.BV.LinearGradient.** { *; }

# ── KeyEvent ─────────────────────────────────────────────────────────────────
-keep class com.github.kevinejohn.keyevent.** { *; }

# ── General Android / JNI safety ─────────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
