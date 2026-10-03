package com.rozgarmitra.gateway_app

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Native half of the SMS gateway.
 *
 * Uses [SmsManager] directly so the *sent* and *delivered* broadcast results can
 * be captured and reported to the server. Most SMS plugins discard those, which
 * loses the distinction between "handed to the carrier" and "actually
 * delivered".
 *
 * The message body is never logged and never written to disk.
 */
class MainActivity : FlutterActivity() {

    private companion object {
        const val METHOD_CHANNEL = "rozgarmitra/gateway"
        const val EVENT_CHANNEL = "rozgarmitra/gateway/events"
        const val REQ_PERMISSION = 1002

        const val ACTION_SENT = "rozgarmitra.SMS_SENT"
        const val ACTION_DELIVERED = "rozgarmitra.SMS_DELIVERED"
        const val EXTRA_JOB_ID = "rozgarmitra.job_id"
    }

    private var methodChannel: MethodChannel? = null
    private var eventChannel: EventChannel? = null

    /** Android fills in `sms_id`; this maps it back to the backend job. */
    private val jobBySmsId = mutableMapOf<Long, String>()
    private var requestCounter = 2000

    private var pendingPermissionResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, METHOD_CHANNEL)
        methodChannel?.setMethodCallHandler { call, result ->
            when (call.method) {
                "hasPermission" -> result.success(hasSmsPermission())
                "requestPermission" -> requestSmsPermission(result)
                "senderNumber" -> result.success(simNumber())
                "sendSms" -> sendSms(call, result)
                else -> result.notImplemented()
            }
        }

        eventChannel = EventChannel(flutterEngine.dartExecutor.binaryMessenger, EVENT_CHANNEL)
        eventChannel?.setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                eventSink = events
            }

            override fun onCancel(arguments: Any?) {
                eventSink = null
            }
        })

        val filter = android.content.IntentFilter().apply {
            addAction(ACTION_SENT)
            addAction(ACTION_DELIVERED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(statusReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(statusReceiver, filter)
        }
    }

    private var eventSink: EventChannel.EventSink? = null

    // -----------------------------------------------------------------------
    // Permissions
    // -----------------------------------------------------------------------

    private fun hasSmsPermission(): Boolean =
        checkSelfPermission(Manifest.permission.SEND_SMS) ==
            PackageManager.PERMISSION_GRANTED

    private fun requestSmsPermission(result: MethodChannel.Result) {
        if (hasSmsPermission()) {
            result.success(true)
            return
        }
        pendingPermissionResult = result
        requestPermissions(
            arrayOf(Manifest.permission.SEND_SMS),
            REQ_PERMISSION,
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_PERMISSION) {
            pendingPermissionResult?.success(
                grantResults.isNotEmpty() &&
                    grantResults[0] == PackageManager.PERMISSION_GRANTED,
            )
            pendingPermissionResult = null
        }
    }

    /** The SIM's own number, when the carrier exposes it. Frequently null. */
    private fun simNumber(): String? = try {
        @Suppress("DEPRECATION")
        (getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager).line1Number
    } catch (e: Exception) {
        null
    }

    // -----------------------------------------------------------------------
    // Sending
    // -----------------------------------------------------------------------

    private fun sendSms(call: MethodCall, result: MethodChannel.Result) {
        val to = call.argument<String>("to")
        val body = call.argument<String>("body")
        val jobId = call.argument<String>("jobId") ?: ""

        if (!hasSmsPermission()) {
            result.error("permission_denied", "SMS permission has not been granted.", null)
            return
        }
        if (to.isNullOrBlank() || body.isNullOrBlank()) {
            result.error("invalid_arguments", "A recipient and message body are required.", null)
            return
        }

        val manager = SmsManager.getDefault()
        // Split for multipart so a long message is not silently truncated.
        val parts = manager.divideMessage(body)
        val requestCode = requestCounter++

        val sentIntents = ArrayList<PendingIntent>(parts.size)
        val deliveredIntents = ArrayList<PendingIntent>(parts.size)

        for (i in parts.indices) {
            val sent = PendingIntent.getBroadcast(
                this,
                requestCode + i,
                Intent(ACTION_SENT).setPackage(packageName).putExtra(EXTRA_JOB_ID, jobId),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            val delivered = PendingIntent.getBroadcast(
                this,
                requestCode + i,
                Intent(ACTION_DELIVERED).setPackage(packageName).putExtra(EXTRA_JOB_ID, jobId),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            sentIntents.add(sent)
            deliveredIntents.add(delivered)
        }

        try {
            manager.sendMultipartTextMessage(to, null, parts, sentIntents, deliveredIntents)
            result.success(null)
        } catch (e: Exception) {
            result.error("send_failed", e.message ?: "The carrier rejected the message.", null)
        }
    }

    // -----------------------------------------------------------------------
    // Delivery receipts
    // -----------------------------------------------------------------------

    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) = handleResult(intent)
    }

    private fun handleResult(intent: Intent?) {
        if (intent == null) return
        val action = intent.action ?: return
        val smsId = intent.getLongExtra("sms_id", -1L)
        // Explicit non-null type: the elvis chain below yields String?, which would
        // not satisfy the map's value type.
        val jobId: String = intent.getStringExtra(EXTRA_JOB_ID)
            ?: if (smsId != -1L) jobBySmsId[smsId] else null
            ?: return

        if (smsId != -1L) jobBySmsId[smsId] = jobId

        var status = "sent"
        var errorCode = ""
        var errorMessage = ""

        when (action) {
            ACTION_SENT -> {
                val code = resultCode(intent)
                if (code != Activity.RESULT_OK) {
                    status = "failed"
                    errorCode = "carrier_rejected"
                    errorMessage = "The carrier did not accept the message."
                }
            }
            ACTION_DELIVERED -> status = "delivered"
            else -> return
        }

        eventSink?.success(mapOf(
            "jobId" to jobId,
            "status" to status,
            "androidMessageId" to smsId.toString(),
            "errorCode" to errorCode,
            "errorMessage" to errorMessage,
        ))
    }

    @Suppress("DEPRECATION")
    private fun resultCode(intent: Intent): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            intent.getIntExtra("resultCode", Activity.RESULT_CANCELED)
        } else {
            // Invoked as a method, not a property: Kotlin does not synthesise the
            // `resultCode` accessor for Intent across SDK levels.
            intent.getResultCode()
        }
}
