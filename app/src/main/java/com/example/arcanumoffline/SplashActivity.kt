package com.example.arcanumoffline

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        val icon = findViewById<TextView>(R.id.splashIcon)
        val title = findViewById<TextView>(R.id.splashTitle)
        val subText = findViewById<TextView>(R.id.splashSubText)
        val byText = findViewById<TextView>(R.id.splashBy)
        val qqText = findViewById<TextView>(R.id.splashQQ)

        val rotateAnim = ObjectAnimator.ofFloat(icon, "rotation", 0f, 360f)
        rotateAnim.duration = 1500
        rotateAnim.interpolator = AccelerateDecelerateInterpolator()

        val fadeInTitle = ObjectAnimator.ofFloat(title, "alpha", 0f, 1f)
        fadeInTitle.duration = 1000

        val fadeInSub = ObjectAnimator.ofFloat(subText, "alpha", 0f, 1f)
        fadeInSub.duration = 800
        fadeInSub.startDelay = 500

        val fadeInBy = ObjectAnimator.ofFloat(byText, "alpha", 0f, 1f)
        fadeInBy.duration = 800
        fadeInBy.startDelay = 800

        val fadeInQQ = ObjectAnimator.ofFloat(qqText, "alpha", 0f, 1f)
        fadeInQQ.duration = 800
        fadeInQQ.startDelay = 1000

        rotateAnim.start()
        fadeInTitle.start()
        fadeInSub.start()
        fadeInBy.start()
        fadeInQQ.start()

        rotateAnim.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                icon.postDelayed({
                    icon.animate()
                        .alpha(0f)
                        .scaleX(1.5f)
                        .scaleY(1.5f)
                        .setDuration(500)
                        .withEndAction {
                            startActivity(Intent(this@SplashActivity, MainActivity::class.java))
                            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
                            finish()
                        }
                        .start()

                    title.animate().alpha(0f).setDuration(500).start()
                    subText.animate().alpha(0f).setDuration(500).start()
                    byText.animate().alpha(0f).setDuration(500).start()
                    qqText.animate().alpha(0f).setDuration(500).start()
                }, 1000)
            }
        })
    }
}