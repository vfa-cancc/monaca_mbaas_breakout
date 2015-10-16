var ncmbController = {
    APPLICATION_KEY: "YOUR_APPLICATION_KEY",
    CLIENT_KEY: "YOUR_CLIENT_KEY",

    ncmb: null,
    currentUser: null,
    screenSize: null,

    // 初期化
    init: function(screenSize) {
        var self = this;
        self.ncmb = new NCMB(self.APPLICATION_KEY, self.CLIENT_KEY);
        self.screenSize = screenSize;

        //閉じるボタンの動作を規定
        $("body").on("click", "#closeRanking", function(){
            self.closeRanking();
        });
    },

    // UUIDが存在すればログイン、しなければ新規作成
    loginWithUUID: function() {
        var self = this;
        var userId = localStorage.getItem("userName");

        if(!userId){
            // ユーザーを作成したことがない
            self.createUser();
        } else if(!self.currentUser) {
            // ログアウト状態：userIdを使ってログイン
            self.ncmb.User.login(userId, userId)
                .then(function(user){
                    // ログイン後：ユーザーデータの更新
                    self.currentUser = user;
                    self.refreshCurrentUser();
                })
                .catch(function(err){
                    // 失敗した場合：ユーザー作成
                    console.log(err);
                    self.createUser();
                });
        } else {
            self.currentUser = self.ncmb.User.getCurrentUser();
            // ログアウトしていない
            self.ncmb.User.login(self.currentUser)
                .then(function(user){
                    // ログイン後：ユーザーデータの更新
                    self.currentUser = user;
                    self.refreshCurrentUser();
                })
                .catch(function(err){
                    // セッション切れの場合はログアウトして再ログイン
                    console.log(err);
                    self.ncmb.User.logout();
                    self.currentUser = null;
                    self.loginWithUUID();
                });
        }
    },

    // currentUser変数を更新
    refreshCurrentUser: function() {
        var self = this;
        if(!self.currentUser) return;
        self.ncmb.User.fetchById(self.currentUser.get("objectId"))
                 .then(function(user){
                     self.currentUser = user;
                  })
                 .catch(function(err){
                    console.log(err);
                    self.currentUser = null;
                  });
    },

    // ユーザー登録
    createUser: function() {
        var self = this;

        //適当なUUIDを作成
        var uuid = self.uuid();

        //ユーザークラスのインスタンスを作成
        //userNameとパスワードにはuuidを設定
        var user = new self.ncmb.User({userName:uuid, password:uuid});

        //会員登録を行うメソッドを実行
        user.signUpByAccount()
            .then(function(user){
                // 登録完了後ログイン;
                localStorage.setItem("userName", uuid);
                self.loginWithUUID();
            })
            .catch(function(err){
                // uuid(userName) が被った場合はエラーが返る
                alert("ユーザー登録に失敗しました");
            });
    },

    // ユーザー名登録フォームの表示
    showDisplayNameDialog: function() {
        var self = this;

        $("#mask").show();
        // ダイアログをいい感じに真ん中に表示する
        $("#userEditWrapper").css("top", self.screenSize.height / 2 - 100);
        $("#userEditWrapper").css("left", self.screenSize.width * 0.1);
        $("#userEditWrapper").show();
    },

    // ユーザー名登録
    updateDisplayName: function(){
        $("#userEditWrapper").hide();
        $("#mask").hide();

        // 入力した名前をカレントユーザーにセット
        var name = $("#name").val();
        this.currentUser.set("displayName", name);

        // 会員情報の更新
        return this.currentUser.update();
    },

    finishGame: function(score){
        var self = this;

        if(!self.currentUser){
            self.loginWithUUID();
        } else if(!self.currentUser.displayName){
            // まだユーザー名を登録していない場合
            self.showDisplayNameDialog();

            $("#submit").on("click", function(){
                self.updateDisplayName()
                    .then(function() {
                        self.sendScore(score);
                    })
                    .catch(function(err) {
                        console.log(err);
                        alert("ユーザー名の登録に失敗しました");
                    });
            });
        } else {
            // ユーザー名登録済：スコア送信
            self.sendScore(score);
        }
    },

    // スコア送信
    sendScore: function(score) {
        var self = this;

        //Score（クラス）を生成
        var Score = self.ncmb.DataStore("ScoreClass");

        //インスタンス生成、スコア数値とログインしているユーザー（ポインタ）をセット
        var scoreData = new Score({score: score, user: self.currentUser});

        //送信処理
        scoreData.save()
            .then(function (saved) {

            // 順位を求める
            Score.greaterThan("score", score)
                .count()
                .fetchAll()
                .then(function(scores){
                    var count = (scores.count !== undefined) ? parseInt(scores.count) + 1 : 1,
                        userName = self.currentUser.displayName;

                    // ダイアログの表示
                    if(typeof navigator.notification !== 'undefined'){
                        navigator.notification.alert(
                            "今回の"+ userName + "の順位は #" + count + "でした！",
                            function(){},
                            "スコア送信完了！"
                            );
                    } else {
                        alert("スコア送信完了！\n今回の"+ userName + "の順位は #" + count + "でした！");
                    }
                })
        })
       .catch(function(err){
            console.log(err);
        });
    },

    // UUIDを生成する
    // https://gist.github.com/jcxplorer/823878
    uuid: function() {
        var uuid = "", i, random;
        for (i = 0; i < 32; i++) {
            random = Math.random() * 16 | 0;

            if (i == 8 || i == 12 || i == 16 || i == 20) {
                uuid += "-";
            }
            uuid += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8) : random)).toString(16);
        }
        return uuid;
    },

    //ランキング画面を表示
    showRanking: function() {
        var self = this;

        //スコア情報を取得するため、クラスを作成
        var Score = self.ncmb.DataStore("ScoreClass");

        //スコアを降順に10件取得、ユーザー情報を含める形で
        Score.order("score", true)
            .include("user")
            .limit(10)
            .fetchAll()
            .then(function(results){
                //ランキング表のHTML生成
                var tableSource = "";
                if(results.length > 0){
                    for(i=0; i<results.length; i++){
                        var score = results[i],
                            rank = i + 1,
                            value = parseInt(score.score),
                            displayName = "NO NAME";
                        if(score.user !== undefined){
                            displayName = score.user.displayName;
                        }
                        tableSource += "<li class=\"list__item list__item--inset\">"
                            + rank + ":"
                            + displayName
                            + " (" + value + ")</li>";
                    }
                } else {
                    tableSource += "<li class=\"list__item list__item--inset\">ランキングはありません</li>";
                }

                //ランキング表を表示
                $("#rankingTable").html(tableSource);
                $("#ranking").show();
            })
            .catch(function(err){
              console.log(err);
            });
    },

    //ランキング画面を閉じる
    closeRanking:function() {
        $("#ranking").hide();
    }
}
